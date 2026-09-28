import { eq } from "drizzle-orm";
import { test, expect, db } from "./fixtures";
import { characters, episodes } from "@/lib/db/schema";

const importedCharacters = [
  {
    name: "Mira",
    scope: "main",
    frequency: 4,
    description: "A traveler",
    visualHint: "Blue coat",
  },
  { name: "Guide", scope: "guest", frequency: 1, description: "A local guide" },
];
const importedEpisodes = [
  {
    title: "Arrival",
    description: "Mira arrives",
    keywords: "forest",
    idea: "An adventure",
    characters: ["Mira", "Guide"],
  },
  {
    title: "Departure",
    description: "Mira leaves",
    keywords: "travel",
    idea: "A journey",
    characters: ["Mira"],
  },
];

test("import retries failed steps, preserves review edits and creates the reviewed episodes", async ({
  page,
  project,
}) => {
  let parsed = 0;
  let extracted = 0;
  let split = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/import/parse")) parsed++;
  });
  await page.route("**/import/characters", async (route) => {
    extracted++;
    await route.fulfill(
      extracted === 1
        ? { status: 502, json: { error: "Character service unavailable" } }
        : { json: { characters: importedCharacters, relationships: [] } },
    );
  });
  await page.route("**/import/split", async (route) => {
    expect(route.request().postDataJSON().allCharacters).toContainEqual({
      name: "Mira",
      scope: "guest",
    });
    split++;
    await route.fulfill(
      split === 1
        ? { status: 502, json: { error: "Split service unavailable" } }
        : { json: { episodes: importedEpisodes } },
    );
  });
  async function checkLayout() {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  }
  await page.goto(`/zh/project/${project.projectId}/import`);
  await checkLayout();
  await page
    .getByLabel("点击或拖拽文件到此处", { exact: true })
    .setInputFiles({
      name: "story.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("SCENE 1\nMira meets a guide in the forest."),
    });
  await page.getByRole("button", { name: "开始导入", exact: true }).click();
  await expect(
    page.getByText("Character service unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认并分集", exact: true }),
  ).toBeVisible();
  expect(parsed).toBe(1);
  expect(extracted).toBe(2);
  await checkLayout();
  await page.getByRole("button", { name: "主角", exact: true }).click();
  await page.getByRole("button", { name: "确认并分集", exact: true }).click();
  await expect(
    page.getByText("Split service unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByLabel("EP.1", { exact: true }).fill("Reviewed arrival");
  await page.getByRole("button", { name: "删除 2", exact: true }).click();
  await expect(page.getByLabel("EP.2", { exact: true })).toHaveCount(0);
  await checkLayout();
  await page.getByRole("button", { name: "确认并创建", exact: true }).click();
  await page.waitForURL(`**/project/${project.projectId}/episodes`);
  const savedEpisodes = db
    .select()
    .from(episodes)
    .where(eq(episodes.projectId, project.projectId))
    .all();
  expect(savedEpisodes.map((episode) => episode.title)).toEqual([
    "Forest",
    "Reviewed arrival",
  ]);
  const savedCharacters = db
    .select()
    .from(characters)
    .where(eq(characters.projectId, project.projectId))
    .all();
  expect(
    savedCharacters.find((character) => character.name === "Mira")?.scope,
  ).toBe("guest");
  expect(parsed).toBe(1);
  expect(extracted).toBe(2);
  expect(split).toBe(2);
});

test("saved import details use the latest successful results and a new import resets the workflow", async ({
  page,
  project,
}) => {
  await page.route("**/import/logs", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      json: [
        {
          id: "error",
          step: 2,
          status: "error",
          message: "Previous attempt failed",
        },
        {
          id: "characters",
          step: 2,
          status: "done",
          message: "Characters extracted",
          metadata: { characters: importedCharacters },
        },
        {
          id: "episodes",
          step: 3,
          status: "done",
          message: "Episodes split",
          metadata: { episodes: importedEpisodes },
        },
      ],
    });
  });
  await page.goto(`/zh/project/${project.projectId}/import`);
  await page.getByRole("button", { name: "角色提取", exact: true }).click();
  await expect(page.getByText("Mira", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "主角", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "自动分集", exact: true }).click();
  await expect(page.getByText("Arrival", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新建导入", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "开始导入", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Previous attempt failed", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "自动分集", exact: true }),
  ).toBeDisabled();
});
