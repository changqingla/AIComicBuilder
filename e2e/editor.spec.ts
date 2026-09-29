import { eq, and } from "drizzle-orm";
import { test, expect, db } from "./fixtures";
import { shots, shotAssets } from "@/lib/db/schema";

test("slow autosave responses preserve newer drafts and save before generation", async ({
  page,
  project,
}) => {
  const shotId = project.currentVersion.shotId;
  const assetId = `${shotId}-first_frame`;
  await page.goto(project.storyboardUrl);
  await page.getByRole("button", { name: "编辑详情 1", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Shot 1", exact: true });
  const prompt = drawer.getByRole("textbox", { name: "首帧描述", exact: true });
  const firstSave = Promise.withResolvers<void>();
  const secondSave = Promise.withResolvers<void>();
  let saves = 0;
  await page.route(`**/assets/${assetId}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    saves++;
    if (saves === 1) {
      const response = await route.fetch();
      await firstSave.promise;
      await route.fulfill({ response });
    } else {
      await secondSave.promise;
      await route.continue();
    }
  });
  const savedPrompt = () =>
    db.select().from(shotAssets).where(eq(shotAssets.id, assetId)).get()!
      .prompt;
  try {
    await prompt.fill("First edit");
    await expect.poll(savedPrompt).toBe("First edit");
    await prompt.fill("Second edit");
    await prompt.blur();
    expect(saves).toBe(1);
    firstSave.resolve();
    await expect.poll(() => saves).toBe(2);
    await expect(prompt).toHaveValue("Second edit");
    secondSave.resolve();
    await expect.poll(savedPrompt).toBe("Second edit");
  } finally {
    firstSave.resolve();
    secondSave.resolve();
  }

  const save = Promise.withResolvers<void>();
  let saving = false;
  let generated = 0;
  await page.route(`**/shots/${shotId}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    saving = true;
    await save.promise;
    await route.continue();
  });
  await page.route("**/generate", async (route) => {
    expect(
      db.select().from(shots).where(eq(shots.id, shotId)).get()!.videoPrompt,
    ).toBe("Fresh video prompt");
    generated++;
    await route.fulfill({ json: { status: "ok" } });
  });
  try {
    await drawer
      .getByLabel("视频提示词", { exact: true })
      .fill("Fresh video prompt");
    await drawer
      .getByRole("button", { name: "重新生成视频", exact: true })
      .click();
    await expect.poll(() => saving).toBe(true);
    expect(generated).toBe(0);
    save.resolve();
    await expect.poll(() => generated).toBe(1);
  } finally {
    save.resolve();
  }
});

test("failed saves block generation and a corrected edit can be saved and generated", async ({
  page,
  project,
}) => {
  const shotId = project.currentVersion.shotId;
  let generated = 0;
  await page.route("**/generate", async (route) => {
    generated++;
    await route.fulfill({ json: { status: "ok" } });
  });
  await page.route(`**/shots/${shotId}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await route.fulfill({
      status: 500,
      json: { error: "Injected save failure" },
    });
  });
  await page.goto(project.storyboardUrl);
  await page.getByRole("button", { name: "编辑详情 1", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Shot 1", exact: true });
  const generate = drawer.getByRole("button", {
    name: "重新生成视频",
    exact: true,
  });
  await drawer.getByLabel("视频提示词", { exact: true }).fill("Failed prompt");
  await generate.click();
  await expect(
    page.getByText("Injected save failure", { exact: true }).first(),
  ).toBeVisible();
  await expect(generate).toBeEnabled();
  expect(generated).toBe(0);
  expect(
    db.select().from(shots).where(eq(shots.id, shotId)).get()!.videoPrompt,
  ).toBe("Original video prompt");
  await page.unroute(`**/shots/${shotId}`);
  await drawer
    .getByLabel("视频提示词", { exact: true })
    .fill("Recovered prompt");
  await generate.click();
  await expect.poll(() => generated).toBe(1);
  expect(
    db.select().from(shots).where(eq(shots.id, shotId)).get()!.videoPrompt,
  ).toBe("Recovered prompt");
});

test("switching versions keeps the displayed shots and generation request aligned", async ({
  page,
  project,
}) => {
  const loading = Promise.withResolvers<void>();
  let requested = false;
  await page.route(
    `**/episodes/${project.episodeId}?versionId=${project.oldVersion.id}`,
    async (route) => {
      requested = true;
      await loading.promise;
      await route.continue();
    },
  );
  await page.goto(project.storyboardUrl);
  await page
    .getByRole("combobox", { name: "版本历史", exact: true })
    .selectOption(project.oldVersion.id);
  try {
    await expect.poll(() => requested).toBe(true);
    await expect(
      page.getByRole("button", {
        name: "Current version forest scene",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "版本历史", exact: true }),
    ).toBeDisabled();
    loading.resolve();
    await expect(
      page.getByRole("button", {
        name: "Old version forest scene",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    loading.resolve();
  }
  await page.getByRole("link", { name: "预览", exact: true }).last().click();
  await page.getByRole("link", { name: "分镜", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Old version forest scene", exact: true }),
  ).toBeVisible();
  let generation: unknown;
  await page.route("**/generate", async (route) => {
    generation = route.request().postDataJSON();
    await route.fulfill({ json: { status: "ok" } });
  });
  await page.getByRole("button", { name: "编辑详情 1", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Shot 1", exact: true })
    .getByRole("button", { name: "重新生成视频", exact: true })
    .click();
  await expect
    .poll(() => generation)
    .toMatchObject({
      payload: {
        shotId: project.oldVersion.shotId,
        versionId: project.oldVersion.id,
      },
    });
});

test("uploads add an asset version and history selection survives a reload", async ({
  page,
  project,
}) => {
  const shotId = project.currentVersion.shotId;
  const activeFrame = () =>
    db
      .select()
      .from(shotAssets)
      .where(
        and(
          eq(shotAssets.shotId, shotId),
          eq(shotAssets.type, "first_frame"),
          eq(shotAssets.isActive, 1),
        ),
      )
      .get()!;
  const original = activeFrame();
  await page.goto(project.storyboardUrl);
  await page.getByRole("button", { name: "编辑详情 1", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Shot 1", exact: true });
  await drawer
    .getByLabel("上传 首帧描述", { exact: true })
    .setInputFiles(project.image);
  await expect
    .poll(() => activeFrame().assetVersion)
    .toBe(original.assetVersion + 1);
  const uploadedId = activeFrame().id;
  await drawer
    .getByRole("button", { name: "首帧描述: previous version", exact: true })
    .click();
  await expect.poll(() => activeFrame().id).toBe(original.id);
  await drawer
    .getByRole("button", { name: "首帧描述: next version", exact: true })
    .click();
  await expect.poll(() => activeFrame().id).toBe(uploadedId);
  await page.reload();
  await page.getByRole("button", { name: "编辑详情 1", exact: true }).click();
  await expect(
    drawer.getByRole("button", {
      name: "首帧描述: previous version",
      exact: true,
    }),
  ).toBeEnabled();
  expect(activeFrame().id).toBe(uploadedId);
});
