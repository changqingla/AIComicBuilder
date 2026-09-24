import { beforeAll, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { generateText } from "ai";
import fs from "node:fs";
import path from "node:path";
import { db, runMigrations } from "@/lib/db";
import { projects, episodes, characters, episodeCharacters, storyboardVersions, shots, agents } from "@/lib/db/schema";
import { POST as generate } from "@/app/api/projects/[id]/generate/route";
import { GET as getBindings, PUT as putBinding } from "@/app/api/projects/[id]/agent-bindings/route";
import { GET as getUpload } from "@/app/api/uploads/[...path]/route";
import { characterExtractionSchema, saveExtractedCharacters } from "@/lib/generation/characters";

vi.mock("ai", () => ({ generateText: vi.fn(), streamText: vi.fn() }));

const routeParams = { params: Promise.resolve({ id: "p-a" }) };
const modelConfig = { text: { protocol: "openai", apiKey: "test", baseUrl: "http://localhost", modelId: "test" } };
function request(body: unknown, userId = "user-a", method = "POST") {
  return new NextRequest("http://localhost/api/test", {
    method, headers: { "content-type": "application/json", "x-user-id": userId },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(() => {
  runMigrations();
  for (const suffix of ["a", "b"]) {
    db.insert(projects).values({ id: `p-${suffix}`, userId: `user-${suffix}`, title: suffix }).run();
    db.insert(episodes).values({ id: `ep-${suffix}`, projectId: `p-${suffix}`, title: suffix, sequence: 1, script: "Existing script" }).run();
    db.insert(characters).values({ id: `char-${suffix}`, projectId: `p-${suffix}`, name: "Alice", description: "Existing description" }).run();
    db.insert(episodeCharacters).values({ id: `link-${suffix}`, episodeId: `ep-${suffix}`, characterId: `char-${suffix}` }).run();
    db.insert(storyboardVersions).values({ id: `v-${suffix}`, projectId: `p-${suffix}`, episodeId: `ep-${suffix}`, label: suffix, versionNum: 1 }).run();
    db.insert(shots).values({ id: `s-${suffix}`, projectId: `p-${suffix}`, episodeId: `ep-${suffix}`, versionId: `v-${suffix}`, sequence: 1 }).run();
    db.insert(agents).values({ id: `agent-${suffix}`, userId: `user-${suffix}`, name: suffix, category: "script_generate", appId: "test", apiKey: "test" }).run();
  }
});

test.each([
  { action: "script_generate", episodeId: "ep-b", payload: { idea: "Must not save" } },
  { action: "single_frame_generate", payload: { shotId: "s-b" } },
  { action: "single_character_image", payload: { characterId: "char-b" } },
  { action: "batch_frame_generate", episodeId: "ep-a", payload: { versionId: "v-b" } },
])("rejects resources outside the requested project: $action", async (body) => {
  expect((await generate(request(body), routeParams)).status).toBe(404);
  expect(db.$client.prepare("SELECT idea FROM episodes WHERE id = 'ep-b'").get()).toEqual({ idea: "" });
});

test("unknown generation actions are rejected instead of enqueued", async () => {
  expect((await generate(request({ action: "unknown" }), routeParams)).status).toBe(400);
  expect(db.$client.prepare("SELECT count(*) AS n FROM tasks").get()).toEqual({ n: 0 });
});

test("binding reads and writes require ownership of the project and agent", async () => {
  expect((await getBindings(request(null, "", "GET"), routeParams)).status).toBe(404);
  expect((await putBinding(request({ category: "script_generate", agentId: "agent-b" }, "user-a", "PUT"), routeParams)).status).toBe(404);
  expect((await putBinding(request({ category: "script_generate", agentId: "agent-a" }, "user-a", "PUT"), routeParams)).status).toBe(200);
});

test("missing model or invalid generated characters preserve existing links", async () => {
  const body = { action: "character_extract", episodeId: "ep-a" };
  expect((await generate(request(body), routeParams)).status).toBe(400);
  vi.mocked(generateText).mockResolvedValueOnce({ text: '{"characters": []}' } as Awaited<ReturnType<typeof generateText>>);
  expect((await generate(request({ ...body, modelConfig }), routeParams)).status).toBe(422);
  expect(db.$client.prepare("SELECT character_id FROM episode_characters WHERE episode_id = 'ep-a'").all()).toEqual([{ character_id: "char-a" }]);
});

test("a failed character replacement rolls back changes to characters and links", () => {
  db.$client.exec("CREATE TRIGGER reject_character_link BEFORE INSERT ON episode_characters BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  try {
    expect(() => saveExtractedCharacters("p-a", "ep-a", characterExtractionSchema.parse({
      characters: [{ name: "Alice", description: "Changed description" }],
    }))).toThrow("test failure");
    expect(db.$client.prepare("SELECT description FROM characters WHERE id = 'char-a'").get()).toEqual({ description: "Existing description" });
    expect(db.$client.prepare("SELECT character_id FROM episode_characters WHERE episode_id = 'ep-a'").all()).toEqual([{ character_id: "char-a" }]);
  } finally {
    db.$client.exec("DROP TRIGGER reject_character_link");
  }
});

test("file reads reject adjacent directories and symlinks outside uploads", async () => {
  const root = process.env.UPLOAD_DIR!;
  fs.writeFileSync(path.join(root, "valid.txt"), "visible");
  const sibling = `${root}-private`;
  fs.mkdirSync(sibling);
  const hidden = path.join(sibling, "hidden.txt");
  fs.writeFileSync(hidden, "private");
  fs.symlinkSync(hidden, path.join(root, "link.txt"));
  for (const segments of [["../uploads-private/hidden.txt"], ["link.txt"]]) {
    expect((await getUpload(request(null, "", "GET"), { params: Promise.resolve({ path: segments }) })).status).toBe(404);
  }
  expect(await (await getUpload(request(null, "", "GET"), { params: Promise.resolve({ path: ["valid.txt"] }) })).text()).toBe("visible");
});
