import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import { generateText } from "ai";
import { db, runMigrations } from "@/lib/db";
import {
  projects,
  episodes,
  shots,
  shotAssets,
  storyboardVersions,
} from "@/lib/db/schema";
import { handleShotSplit } from "@/lib/generation/storyboards";
import { handleGenerateAssetPrompts } from "@/lib/generation/asset-prompts";
import {
  getActiveAsset,
  getAssetHistory,
  insertAssetVersion,
} from "@/lib/shot-asset-utils";

const mocks = vi.hoisted(() => ({
  text: vi.fn(),
  agent: vi.fn(),
  bound: vi.fn(),
}));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/prompts/resolver", () => ({
  resolvePrompt: async () => "Return the requested JSON format",
}));
vi.mock("@/lib/ai/provider-factory", () => ({
  resolveAIProvider: () => ({ generateText: mocks.text }),
}));
vi.mock("@/lib/generation/common", async (original) => ({
  ...(await original<typeof import("@/lib/generation/common")>()),
  findBoundAgent: mocks.bound,
  callProjectAgent: mocks.agent,
}));
const modelConfig = {
  text: {
    protocol: "openai",
    apiKey: "test",
    baseUrl: "https://example.invalid",
    modelId: "test",
  },
};
const input = {
  action: "shot_split" as const,
  projectId: "p",
  episodeId: "ep",
  userId: "owner",
  modelConfig,
};
const shot = {
  sequence: 1,
  sceneDescription: "A forest",
  motionScript: "Trees move",
  videoScript: "A windy forest",
  duration: 5,
  dialogues: [],
  cameraDirection: "static",
  characters: [],
};

beforeAll(() => {
  runMigrations();
  db.insert(projects).values({ id: "p", title: "Test", userId: "owner" }).run();
  db.insert(episodes)
    .values({
      id: "ep",
      projectId: "p",
      title: "Test",
      sequence: 1,
      script: Array.from(
        { length: 9 },
        (_, i) => `SCENE ${i + 1}\nA forest`,
      ).join("\n"),
    })
    .run();
  db.insert(storyboardVersions)
    .values({
      id: "original",
      projectId: "p",
      episodeId: "ep",
      label: "original",
      versionNum: 1,
    })
    .run();
  for (let i = 1; i <= 9; i++) {
    db.insert(shots)
      .values({
        id: `s${i}`,
        projectId: "p",
        episodeId: "ep",
        versionId: "original",
        sequence: i,
        prompt: "Forest",
      })
      .run();
    insertAssetVersion({
      shotId: `s${i}`,
      type: "reference",
      prompt: "Existing prompt",
      fileUrl: `existing-${i}.png`,
      status: "completed",
    });
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bound.mockResolvedValue(null);
});
function textResult(text: string) {
  return { text } as Awaited<ReturnType<typeof generateText>>;
}

test("a failed later chunk never saves a partial storyboard version", async () => {
  vi.mocked(generateText)
    .mockResolvedValueOnce(textResult(JSON.stringify([shot])))
    .mockResolvedValueOnce(textResult("invalid JSON"));
  await expect(handleShotSplit(input)).rejects.toThrow("Shot chunk 2 failed");
  expect(db.select().from(storyboardVersions).all()).toHaveLength(1);
  expect(db.select().from(shots).all()).toHaveLength(9);
});

test("a database failure rolls back the version and all its shots", async () => {
  vi.mocked(generateText).mockResolvedValue(textResult(JSON.stringify([shot])));
  db.$client.exec(
    "CREATE TRIGGER reject_second_shot BEFORE INSERT ON shots WHEN NEW.sequence = 2 BEGIN SELECT RAISE(ABORT, 'injected write failure'); END",
  );
  try {
    await expect(handleShotSplit(input)).rejects.toThrow(
      "injected write failure",
    );
    expect(db.select().from(storyboardVersions).all()).toHaveLength(1);
    expect(db.select().from(shots).all()).toHaveLength(9);
  } finally {
    db.$client.exec("DROP TRIGGER reject_second_shot");
  }
});

test("Agent and native generation accept the same current format and save complete versions", async () => {
  vi.mocked(generateText).mockResolvedValue(textResult(JSON.stringify([shot])));
  const native = await handleShotSplit(input);
  mocks.bound.mockResolvedValue({
    platform: "dify",
    appId: "test",
    apiKey: "test",
  });
  mocks.agent.mockResolvedValue({ text: JSON.stringify([shot]) });
  const agent = await handleShotSplit({ ...input, modelConfig: undefined });
  expect(native.shots).toBe(2);
  expect(agent.shots).toBe(2);
  expect(agent.versionId).not.toBe(native.versionId);
  const versions = db.select().from(storyboardVersions).all();
  expect(versions.map((version) => version.versionNum)).toEqual([1, 2, 3]);
  mocks.agent.mockResolvedValue({
    text: JSON.stringify([{ sceneTitle: "Old format", shots: [shot] }]),
  });
  await expect(handleShotSplit(input)).rejects.toThrow("Shot chunk");
  expect(db.select().from(storyboardVersions).all()).toHaveLength(3);
});

const promptsInput = {
  ...input,
  action: "generate_ref_prompts" as const,
  payload: { versionId: "original" },
};
const firstPrompts = Array.from({ length: 8 }, (_, i) => ({
  shotSequence: i + 1,
  characters: [],
  scenes: [{ name: "Forest", prompt: "New prompt" }],
}));
test("failed or incomplete prompt batches preserve every existing asset", async () => {
  const before = db.select().from(shotAssets).all();
  mocks.text
    .mockResolvedValueOnce(JSON.stringify(firstPrompts))
    .mockResolvedValueOnce("[]");
  await expect(handleGenerateAssetPrompts(promptsInput)).rejects.toThrow(
    "do not match",
  );
  expect(db.select().from(shotAssets).all()).toEqual(before);
});

test("successful prompt batches preserve previous generated files in history", async () => {
  mocks.text
    .mockResolvedValueOnce(JSON.stringify(firstPrompts))
    .mockResolvedValueOnce(
      JSON.stringify([
        {
          shotSequence: 9,
          characters: [],
          scenes: [{ name: "Forest", prompt: "New prompt" }],
        },
      ]),
    );
  expect(await handleGenerateAssetPrompts(promptsInput)).toEqual({
    updatedCount: 9,
    totalShots: 9,
  });
  expect((await getActiveAsset("s1", "reference"))?.prompt).toBe("New prompt");
  expect(
    (await getAssetHistory("s1", "reference")).map((asset) => asset.fileUrl),
  ).toEqual([null, "existing-1.png"]);
});
