import { beforeAll, expect, test, vi } from "vitest";
import { db, runMigrations } from "@/lib/db";
import { projects, episodes } from "@/lib/db/schema";
import { handleScriptGenerate } from "@/lib/generation/scripts";

const mocks = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("@/lib/ai/agent-caller", () => ({ callAgentStream: mocks.stream }));
vi.mock("@/lib/generation/common", () => ({
  findBoundAgent: async () => ({
    platform: "dify",
    appId: "test",
    apiKey: "test",
  }),
}));
vi.mock("@/lib/ai/prompts/resolver", () => ({
  resolvePrompt: async () => "Generate script",
}));
const input = {
  projectId: "p",
  episodeId: "a",
  userId: "owner",
  action: "script_generate" as const,
  payload: { idea: "New idea" },
};
beforeAll(() => {
  runMigrations();
  db.insert(projects).values({ id: "p", title: "Test" }).run();
  for (const id of ["a", "b"])
    db.insert(episodes)
      .values({
        id,
        projectId: "p",
        title: id,
        sequence: 1,
        script: "Existing script",
      })
      .run();
});
test("interrupted streaming preserves the previously saved script", async () => {
  mocks.stream.mockResolvedValueOnce(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("Partial text"));
        controller.error(new Error("Connection interrupted"));
      },
    }),
  );
  await expect(
    new Response(await handleScriptGenerate(input)).text(),
  ).rejects.toThrow("Connection interrupted");
  expect(
    db
      .select()
      .from(episodes)
      .all()
      .map((episode) => episode.script),
  ).toEqual(["Existing script", "Existing script"]);
});
test("complete streaming saves to its captured episode before the response finishes", async () => {
  mocks.stream.mockResolvedValueOnce(new Response("完整剧本").body);
  expect(await new Response(await handleScriptGenerate(input)).text()).toBe(
    "完整剧本",
  );
  expect(
    db
      .select()
      .from(episodes)
      .all()
      .map((episode) => episode.script),
  ).toEqual(["完整剧本", "Existing script"]);
});
test("saving errors fail the response instead of claiming success", async () => {
  mocks.stream.mockResolvedValueOnce(new Response("Not saved").body);
  db.$client.exec(
    "CREATE TRIGGER reject_script BEFORE UPDATE ON episodes BEGIN SELECT RAISE(ABORT, 'write failed'); END",
  );
  try {
    await expect(
      new Response(await handleScriptGenerate(input)).text(),
    ).rejects.toThrow("write failed");
  } finally {
    db.$client.exec("DROP TRIGGER reject_script");
  }
  expect(db.select().from(episodes).all()[0].script).toBe("完整剧本");
});
