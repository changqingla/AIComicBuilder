import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, runMigrations } from "@/lib/db";
import {
  characters,
  episodes,
  episodeCharacters,
  projects,
  shots,
} from "@/lib/db/schema";
import { insertAssetVersion } from "@/lib/shot-asset-utils";
import { handleSingleVideoPrompt } from "@/lib/generation/video-prompts";
import { handleSingleReferenceVideo } from "@/lib/generation/reference-videos";

const mocks = vi.hoisted(() => ({
  text: vi.fn(),
  bound: vi.fn(),
  agent: vi.fn(),
  video: vi.fn(),
  generateVideo: vi.fn(),
}));
vi.mock("@/lib/ai/provider-factory", () => ({
  resolveAIProvider: () => ({ generateText: mocks.text }),
  resolveVideoProvider: mocks.video,
}));
vi.mock("@/lib/generation/common", async (original) => ({
  ...(await original<typeof import("@/lib/generation/common")>()),
  findBoundAgent: mocks.bound,
  callProjectAgent: mocks.agent,
}));
const provider = {
  protocol: "openai",
  apiKey: "test",
  baseUrl: "https://example.invalid",
  modelId: "test",
};
let counter = 0;
function fixture(mode: "reference" | "keyframe", complete = true) {
  const shotId = `shot-${counter++}`;
  db.update(episodes)
    .set({ generationMode: mode })
    .where(eq(episodes.id, "ep"))
    .run();
  db.insert(shots)
    .values({
      id: shotId,
      projectId: "p",
      episodeId: "ep",
      sequence: 1,
      videoPrompt: "Existing prompt",
    })
    .run();
  for (let index = 0; index < 2; index++) {
    insertAssetVersion({
      shotId,
      type:
        mode === "reference"
          ? "reference"
          : index === 0
            ? "first_frame"
            : "last_frame",
      sequenceInType: mode === "reference" ? index : 0,
      prompt: index === 0 ? "Opening forest" : "Closing forest",
      fileUrl: complete || index === 0 ? `frame-${index}.png` : null,
      characters: ["Alice", "Bob"],
    });
  }
  return {
    action: "single_video_prompt" as const,
    projectId: "p",
    userId: "owner",
    episodeId: "ep",
    payload: { shotId, overwrite: true },
    modelConfig: { text: provider, video: provider },
  };
}
beforeAll(() => {
  runMigrations();
  db.insert(projects).values({ id: "p", title: "Test", userId: "owner" }).run();
  db.insert(episodes)
    .values({ id: "ep", projectId: "p", title: "Test", sequence: 1 })
    .run();
  // Insert characters in a different order than their IDs to expose inconsistent queries.
  for (const name of ["Bob", "Alice"]) {
    const id = name.toLowerCase();
    db.insert(characters)
      .values({ id, projectId: "p", name, referenceImage: `${id}.png` })
      .run();
    db.insert(episodeCharacters)
      .values({ id: `link-${id}`, episodeId: "ep", characterId: id })
      .run();
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bound.mockResolvedValue(null);
  mocks.text.mockResolvedValue("Generated prompt");
  mocks.video.mockReturnValue({ generateVideo: mocks.generateVideo });
  mocks.generateVideo.mockResolvedValue({ filePath: "generated.mp4" });
});

test("reference image numbers match the images sent to the text model", async () => {
  await handleSingleVideoPrompt(fixture("reference"));
  const [prompt, options] = mocks.text.mock.calls[0];
  expect(prompt).toContain("@图片1 = 角色：Alice");
  expect(prompt).toContain("@图片2 = 角色：Bob");
  expect(prompt).toContain("@图片3 = 场景");
  expect(options.images).toEqual([
    "alice.png",
    "bob.png",
    "frame-0.png",
    "frame-1.png",
  ]);
});

test("the video model receives images in exactly the same order as the prompt model", async () => {
  const input = fixture("reference");
  await handleSingleVideoPrompt(input);
  await handleSingleReferenceVideo({
    ...input,
    action: "single_reference_video",
  });
  expect(mocks.generateVideo.mock.calls[0][0].referenceImages).toEqual(
    mocks.text.mock.calls[0][1].images,
  );
});

test("keyframe prompts describe the supplied start and end frames", async () => {
  await handleSingleVideoPrompt(fixture("keyframe"));
  const [prompt, options] = mocks.text.mock.calls[0];
  expect(prompt).toContain("Opening forest");
  expect(prompt).toContain("Closing forest");
  expect(prompt).not.toContain("@图片");
  expect(options.images).toEqual(["frame-0.png", "frame-1.png"]);
});

test("empty native text preserves the previous video prompt", async () => {
  const input = fixture("keyframe");
  mocks.text.mockResolvedValue("  \n ");
  await expect(handleSingleVideoPrompt(input)).rejects.toMatchObject({
    status: 422,
  });
  expect(
    db.select().from(shots).where(eq(shots.id, input.payload.shotId)).get()
      ?.videoPrompt,
  ).toBe("Existing prompt");
});

test("ambiguous Agent results preserve the previous video prompt", async () => {
  const input = fixture("reference");
  mocks.bound.mockResolvedValue({});
  mocks.agent.mockResolvedValue({
    text: JSON.stringify([
      { sequence: 1, videoPrompt: "One" },
      { sequence: 1, videoPrompt: "Two" },
    ]),
  });
  await expect(handleSingleVideoPrompt(input)).rejects.toMatchObject({
    status: 422,
  });
  expect(
    db.select().from(shots).where(eq(shots.id, input.payload.shotId)).get()
      ?.videoPrompt,
  ).toBe("Existing prompt");
});

test("incomplete reference images stop video generation before calling the provider", async () => {
  await expect(
    handleSingleReferenceVideo({
      ...fixture("reference", false),
      action: "single_reference_video",
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.video).not.toHaveBeenCalled();
});
