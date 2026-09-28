import { beforeAll, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { extractTextFromFile } from "@/lib/import-utils";
import { db, runMigrations } from "@/lib/db";
import {
  projects,
  characters,
  episodes,
  episodeCharacters,
  characterRelations,
  importLogs,
} from "@/lib/db/schema";
import { POST as importProject } from "@/app/api/projects/[id]/import/generate/route";

beforeAll(() => {
  runMigrations();
  db.insert(projects)
    .values({ id: "import-project", userId: "owner", title: "Import" })
    .run();
});

const data = {
  characters: [
    { name: "Alice", scope: "main", description: "Traveler" },
    { name: "Guide", scope: "guest", description: "Local guide" },
  ],
  episodes: [
    {
      title: "Arrival",
      description: "",
      keywords: "",
      idea: "",
      characters: ["Alice", "Guide", "Alice"],
    },
    {
      title: "Departure",
      description: "",
      keywords: "",
      idea: "",
      characters: ["Alice"],
    },
  ],
  relationships: [
    { characterA: "Alice", characterB: "Guide", relationType: "friend" },
  ],
};

function createImport(body: unknown = data) {
  return importProject(
    new Request("http://localhost/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "owner" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "import-project" }) },
  );
}

test("PDF import extracts the screenplay with the maintained parser", async () => {
  const file = readFileSync(
    new URL("./fixtures/short-script.pdf", import.meta.url),
  );
  expect(await extractTextFromFile(file, "short-script.pdf")).toContain(
    "SCENE 1: A quiet forest.",
  );
});

test("a failed import rolls back characters, relationships and episodes before retrying", async () => {
  db.$client.exec(
    "CREATE TRIGGER reject_import BEFORE INSERT ON episodes WHEN NEW.title = 'Departure' BEGIN SELECT RAISE(ABORT, 'injected import failure'); END",
  );
  try {
    expect((await createImport()).status).toBe(500);
    expect(db.select().from(characters).all()).toHaveLength(0);
    expect(db.select().from(episodes).all()).toHaveLength(0);
    expect(db.select().from(episodeCharacters).all()).toHaveLength(0);
    expect(db.select().from(characterRelations).all()).toHaveLength(0);
    expect(
      db
        .select()
        .from(importLogs)
        .all()
        .some((log) => log.status === "done"),
    ).toBe(false);
  } finally {
    db.$client.exec("DROP TRIGGER reject_import");
  }
  expect((await createImport()).status).toBe(201);
  expect(db.select().from(characters).all()).toHaveLength(2);
  expect(
    db
      .select()
      .from(episodes)
      .all()
      .map((episode) => episode.sequence),
  ).toEqual([1, 2]);
  expect(db.select().from(episodeCharacters).all()).toHaveLength(3);
  expect(db.select().from(characterRelations).all()).toHaveLength(1);
});

test("invalid import data is rejected before any database writes", async () => {
  const before = db.select().from(characters).all();
  const logs = db.select().from(importLogs).all();
  expect(
    (
      await createImport({
        ...data,
        episodes: [{ ...data.episodes[0], title: " " }],
      })
    ).status,
  ).toBe(400);
  expect(db.select().from(characters).all()).toEqual(before);
  expect(db.select().from(importLogs).all()).toEqual(logs);
});
