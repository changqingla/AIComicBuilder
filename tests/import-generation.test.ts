import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { generateText } from "ai";
import { db, runMigrations } from "@/lib/db";
import { importLogs, projects } from "@/lib/db/schema";
import { POST as extractCharacters } from "@/app/api/projects/[id]/import/characters/route";
import { POST as splitEpisodes } from "@/app/api/projects/[id]/import/split/route";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/prompts/resolver", () => ({
  resolvePrompt: async () => "Return the requested JSON format",
}));

const episode = {
  title: "Arrival",
  description: "Alice arrives in town",
  keywords: "arrival, town",
  idea: "Alice meets the guide at the station.",
  characters: ["Alice", "Guide"],
};

function characterResult(index: number) {
  return {
    characters: [
      { name: `Character ${index}`, frequency: 1, description: "Traveler" },
    ],
    relationships: [],
  };
}

function episodeResult(index: number) {
  return [{ ...episode, title: `Episode ${index}` }];
}

const routes = [
  {
    name: "character extraction",
    handle: extractCharacters,
    step: 2,
    modelResult: characterResult,
    expected: {
      characters: Array.from({ length: 7 }, (_, i) => ({
        ...characterResult(i).characters[0],
        scope: "guest",
      })),
      relationships: [],
    },
  },
  {
    name: "episode splitting",
    handle: splitEpisodes,
    step: 3,
    modelResult: episodeResult,
    expected: {
      episodes: Array.from({ length: 7 }, (_, i) => episodeResult(i)[0]),
    },
  },
];

beforeAll(() => {
  runMigrations();
  db.insert(projects)
    .values({ id: "import-generation", title: "Import", userId: "owner" })
    .run();
});

beforeEach(() => {
  vi.mocked(generateText).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.delete(importLogs).run();
});

afterEach(() => vi.restoreAllMocks());

function textResult(text: string) {
  return { text } as Awaited<ReturnType<typeof generateText>>;
}

function requestImport(
  handle: typeof splitEpisodes | typeof extractCharacters,
  chunkCount = 1,
) {
  return handle(
    new Request("http://localhost/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "owner" },
      body: JSON.stringify({
        text: Array.from(
          { length: chunkCount },
          (_, i) => `CHUNK_${i}\n${"Story paragraph. ".repeat(400)}`,
        ).join("\n\n"),
        allCharacters: [],
        modelConfig: {
          text: {
            protocol: "openai",
            modelId: "test",
            baseUrl: "https://example.invalid",
            apiKey: "test",
          },
        },
      }),
    }),
    { params: Promise.resolve({ id: "import-generation" }) },
  );
}

test.each(routes)(
  "$name limits concurrent requests including retries and preserves text order",
  async ({ handle, step, modelResult, expected }) => {
    let active = 0;
    let peak = 0;
    let draining = false;
    const attempts = new Map<number, number>();
    const release: Array<() => void> = [];
    vi.mocked(generateText).mockImplementation(async ({ prompt }) => {
      const index = Number(String(prompt).match(/CHUNK_(\d+)/)![1]);
      const attempt = (attempts.get(index) ?? 0) + 1;
      attempts.set(index, attempt);
      peak = Math.max(peak, ++active);
      if (!draining)
        await new Promise<void>((resolve) => release.push(resolve));
      active--;
      return textResult(
        index === 1 && attempt === 1
          ? "invalid JSON"
          : JSON.stringify(modelResult(index)),
      );
    });

    const pending = requestImport(handle, 7);
    try {
      await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(3));
      // Finish each group in reverse order; the retry must also occupy a slot.
      release
        .splice(0)
        .reverse()
        .forEach((resolve) => resolve());
      await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(6));
      release
        .splice(0)
        .reverse()
        .forEach((resolve) => resolve());
      await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(8));
      expect(
        db
          .select()
          .from(importLogs)
          .all()
          .some((log) => log.status === "done"),
      ).toBe(false);
      release
        .splice(0)
        .reverse()
        .forEach((resolve) => resolve());

      const response = await pending;
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expected);
      expect(peak).toBe(3);
      expect(active).toBe(0);
      expect(attempts.get(1)).toBe(2);
      const completed = db
        .select()
        .from(importLogs)
        .all()
        .filter((log) => log.status === "done");
      expect(completed).toHaveLength(1);
      expect(completed[0]).toMatchObject({ step, metadata: expected });
    } finally {
      draining = true;
      release.splice(0).forEach((resolve) => resolve());
      await pending;
    }
  },
);

test.each([
  { name: "malformed JSON", text: "[{" },
  {
    name: "an object instead of an array",
    text: JSON.stringify({ episodes: [episode] }),
  },
  { name: "an empty array", text: "[]" },
  { name: "a blank title", text: JSON.stringify([{ ...episode, title: " " }]) },
  { name: "missing fields", text: JSON.stringify([{ title: "Arrival" }]) },
  {
    name: "invalid character names",
    text: JSON.stringify([{ ...episode, characters: [42] }]),
  },
])(
  "episode splitting retries $name and accepts the corrected result",
  async ({ text }) => {
    vi.mocked(generateText)
      .mockResolvedValueOnce(textResult(text))
      .mockResolvedValueOnce(textResult(JSON.stringify([episode])));
    const response = await requestImport(splitEpisodes);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ episodes: [episode] });
    expect(generateText).toHaveBeenCalledTimes(2);
  },
);

test.each(routes)(
  "$name rejects an invalid retry without publishing partial results from other chunks",
  async ({ handle, step, modelResult }) => {
    vi.mocked(generateText).mockImplementation(async ({ prompt }) => {
      const isFirstChunk = String(prompt).includes("CHUNK_0");
      return textResult(JSON.stringify(isFirstChunk ? modelResult(0) : [{}]));
    });
    const response = await requestImport(handle, 2);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(generateText).toHaveBeenCalledTimes(3);
    const logs = db.select().from(importLogs).all();
    expect(logs.some((log) => log.status === "done")).toBe(false);
    expect(logs.filter((log) => log.status === "error")).toEqual([
      expect.objectContaining({ step, metadata: {} }),
    ]);
  },
);
