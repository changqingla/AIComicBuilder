import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, runMigrations } from "@/lib/db";
import {
  characters,
  episodeCharacters,
  episodes,
  projects,
} from "@/lib/db/schema";
import {
  handleBatchCharacterImage,
  handleSingleCharacterImage,
} from "@/lib/generation/characters";

const { generateImage } = vi.hoisted(() => ({ generateImage: vi.fn() }));
vi.mock("@/lib/ai/provider-factory", () => ({
  resolveImageProvider: () => ({ generateImage }),
}));

const input = {
  action: "batch_character_image" as const,
  projectId: "project",
  episodeId: "episode",
  userId: "owner",
  modelConfig: {
    image: {
      protocol: "openai",
      modelId: "test",
      baseUrl: "https://example.invalid",
      apiKey: "test",
    },
  },
};

beforeAll(() => {
  runMigrations();
  db.insert(projects)
    .values({ id: "project", title: "Test", userId: "owner" })
    .run();
  db.insert(episodes)
    .values({ id: "episode", projectId: "project", title: "Test", sequence: 1 })
    .run();
});

beforeEach(() => {
  vi.clearAllMocks();
  db.delete(characters).run();
});

function addCharacter(id: string, image: string | null = null, linked = true) {
  db.insert(characters)
    .values({ id, projectId: "project", name: id, referenceImage: image })
    .run();
  if (linked)
    db.insert(episodeCharacters)
      .values({ id: `link-${id}`, episodeId: "episode", characterId: id })
      .run();
}

test("batch generation limits concurrency, skips existing images and continues after an individual failure", async () => {
  for (let i = 0; i < 7; i++) addCharacter(`character-${i}`);
  addCharacter("existing", "existing.png");
  addCharacter("unlinked", null, false);
  let active = 0;
  let peak = 0;
  let calls = 0;
  const release: Array<() => void> = [];
  generateImage.mockImplementation(async () => {
    const index = calls++;
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => release.push(resolve));
    active--;
    if (index === 1) throw new Error("Image provider unavailable");
    return `generated-${index}.png`;
  });
  const pending = handleBatchCharacterImage(input);
  await vi.waitFor(() => expect(calls).toBe(3));
  release.splice(0).forEach((resolve) => resolve());
  await vi.waitFor(() => expect(calls).toBe(6));
  release.splice(0).forEach((resolve) => resolve());
  await vi.waitFor(() => expect(calls).toBe(7));
  release.splice(0).forEach((resolve) => resolve());
  const { results } = await pending;
  expect(peak).toBe(3);
  expect(results.filter((result) => result.status === "ok")).toHaveLength(6);
  expect(results.filter((result) => result.status === "error")).toHaveLength(1);
  expect(
    db.select().from(characters).where(eq(characters.id, "existing")).get()
      ?.referenceImage,
  ).toBe("existing.png");
  expect(
    db.select().from(characters).where(eq(characters.id, "unlinked")).get()
      ?.referenceImage,
  ).toBeNull();
});

test("single and batch generation preserve the same image history", async () => {
  addCharacter("alice");
  generateImage
    .mockResolvedValueOnce("first.png")
    .mockResolvedValueOnce("second.png");
  await handleBatchCharacterImage(input);
  await handleSingleCharacterImage({
    ...input,
    action: "single_character_image",
    payload: { characterId: "alice" },
  });
  const character = db
    .select()
    .from(characters)
    .where(eq(characters.id, "alice"))
    .get()!;
  expect(character.referenceImage).toBe("second.png");
  expect(JSON.parse(character.referenceImageHistory!)).toEqual([
    "first.png",
    "second.png",
  ]);
  expect(generateImage.mock.calls[0]).toEqual(generateImage.mock.calls[1]);
  expect((await handleBatchCharacterImage(input)).results).toHaveLength(0);
  expect(generateImage).toHaveBeenCalledTimes(2);
});
