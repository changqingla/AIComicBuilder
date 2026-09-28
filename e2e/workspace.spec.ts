import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, db } from "./fixtures";
import { episodes, projects, characters } from "@/lib/db/schema";
import zh from "../messages/zh.json";

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const documentWidth = document.documentElement.scrollWidth;
        const viewportWidth = window.innerWidth;
        const overflowing = Array.from(
          document.querySelectorAll<HTMLElement>("[role=dialog]"),
        )
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map(
            (element) =>
              element.getAttribute("aria-label") ||
              element.textContent?.slice(0, 80),
          );
        return {
          page: documentWidth > viewportWidth + 1,
          dialogs: overflowing,
        };
      }),
    )
    .toEqual({ page: false, dialogs: [] });
}

test("an empty screenplay accepts manual editing and saves before leaving the page", async ({
  page,
  project,
}) => {
  db.update(episodes)
    .set({ script: "", idea: "", outline: "" })
    .where(eq(episodes.id, project.episodeId))
    .run();
  await page.goto(project.storyboardUrl.replace("/storyboard", "/script"));
  const script = page.getByRole("textbox", {
    name: zh.workspace.scriptDocument,
    exact: true,
  });
  await expect(script).toBeEditable();
  await page
    .getByLabel(zh.project.idea, { exact: true })
    .fill("雨夜，末班地铁驶入一座没有地图的车站。");
  await page
    .getByLabel(zh.project.outline, { exact: true })
    .fill("乘客发现旧车票上写着自己的名字。");
  const text = "第一场 · 地铁站台 · 夜\n林夏：这里不是终点站。";
  await script.fill(text);
  await page.getByRole("link", { name: "2 角色", exact: true }).click();
  await expect
    .poll(
      () =>
        db
          .select()
          .from(episodes)
          .where(eq(episodes.id, project.episodeId))
          .get()?.script,
    )
    .toBe(text);
  await page.getByRole("link", { name: "1 剧本", exact: true }).click();
  await expect(script).toHaveValue(text);
  await page.reload();
  await expect(script).toHaveValue(text);
});

test("provider tabs support the keyboard and model changes reach the defaults", async ({
  page,
  project,
}) => {
  expect(project.projectId).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh/settings");
  const textTab = page.getByRole("tab", {
    name: zh.settings.languageModels,
    exact: true,
  });
  await textTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: zh.settings.imageModels, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const videoTab = page.getByRole("tab", {
    name: zh.settings.videoModels,
    exact: true,
  });
  await expect(videoTab).toBeFocused();
  await videoTab.click();
  const panel = page.getByRole("tabpanel", {
    name: zh.settings.videoModels,
    exact: true,
  });
  await panel
    .getByRole("textbox", { name: zh.settings.providerName })
    .fill("Local video provider");
  await panel
    .getByRole("textbox", { name: zh.settings.manualModelPlaceholder })
    .fill("new-video-model");
  await panel
    .getByRole("button", { name: zh.workspace.addModel, exact: true })
    .click();
  const enabled = panel.getByRole("checkbox", {
    name: "new-video-model",
    exact: true,
  });
  await enabled.check();
  await page
    .getByRole("combobox", { name: zh.settings.defaultVideoModel, exact: true })
    .selectOption("video:new-video-model");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("model-store")!).state
            .defaultVideoModel,
      ),
    )
    .toEqual({ providerId: "video", modelId: "new-video-model" });
  await page.getByText(zh.workspace.advancedSettings, { exact: true }).click();
  await page
    .getByRole("button", { name: zh.settings.addAgent, exact: true })
    .click();
  const form = page.locator("form");
  await form
    .getByRole("textbox", { name: zh.settings.agentName, exact: true })
    .fill("Script reviewer");
  await form
    .getByRole("textbox", { name: zh.settings.agentAppId, exact: true })
    .fill("test-agent");
  await form.getByLabel("API Key", { exact: true }).fill("test-key");
  await form.getByRole("button", { name: zh.common.save, exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Script reviewer", exact: true }),
  ).toBeVisible();
  await expectNoOverflow(page);
});

test("workspace routes fit desktop, tablet and phone layouts", async ({
  page,
  project,
}, testInfo) => {
  test.setTimeout(120_000);
  db.update(projects)
    .set({ title: "雾都来信" })
    .where(eq(projects.id, project.projectId))
    .run();
  db.update(episodes)
    .set({
      title: "第一封信",
      description: "一封迟到十年的信，让林夏回到了记忆中的旧城。",
      idea: "雨夜的旧城，失踪多年的朋友寄来一封信。",
      outline: "林夏回到旧城，在钟表店遇到守候多年的修表匠。",
      script:
        "第一场 · 旧城车站 · 夜\n\n细雨落在空荡的站台上。林夏下了最后一班车，手里紧紧攥着信封。\n\n林夏：十年了，为什么偏偏是现在？\n\n远处的钟楼敲响。她抬头，看见一个熟悉的背影消失在雾中。",
    })
    .where(eq(episodes.id, project.episodeId))
    .run();
  db.insert(characters)
    .values({
      id: randomUUID(),
      projectId: project.projectId,
      name: "修表匠",
      description: "旧城钟表店的主人",
      scope: "guest",
    })
    .run();
  const projectBase = `/zh/project/${project.projectId}`;
  const episodeBase = `${projectBase}/episodes/${project.episodeId}`;
  const routes = [
    ["projects", "/zh"],
    ["episodes", `${projectBase}/episodes`],
    ["script", `${episodeBase}/script`],
    ["characters", `${episodeBase}/characters`],
    ["storyboard", `${episodeBase}/storyboard`],
    ["preview", `${episodeBase}/preview`],
    ["import", `${projectBase}/import`],
    ["project-characters", `${projectBase}/characters`],
    ["project-prompts", `${projectBase}/prompts`],
    ["settings", "/zh/settings"],
    ["prompts", "/zh/settings/prompts"],
  ];
  const translationErrors: string[] = [];
  page.on("console", (message) => {
    if (/MISSING_MESSAGE|INVALID_MESSAGE/.test(message.text()))
      translationErrors.push(message.text());
  });
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const [name, url] of routes) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      if (name === "project-characters")
        await expect(
          page.getByRole("textbox", { name: zh.character.name }).last(),
        ).toHaveValue("修表匠");
      await expectNoOverflow(page);
      if (name === "episodes" && width >= 768) {
        const card = page.locator("article").first();
        const thumbnail = await card.locator(":scope > a > div").boundingBox();
        const body = await card.locator(":scope > div").last().boundingBox();
        expect(thumbnail!.x + thumbnail!.width).toBeLessThanOrEqual(
          body!.x + 1,
        );
      }
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: testInfo.outputPath(`${name}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  expect(translationErrors).toEqual([]);
});

test("phone drawers allow shot editing and saving project prompts", async ({
  page,
  project,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(project.storyboardUrl);
  await page
    .getByRole("button", { name: "Open editor 1", exact: true })
    .click();
  const shot = page.getByRole("dialog", { name: "Shot 1", exact: true });
  await expect(
    shot.getByRole("textbox", { name: "首帧描述", exact: true }),
  ).toBeEditable();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("shot-drawer-phone.png") });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: zh.promptTemplates.editPrompt, exact: true })
    .click();
  const prompt = page.getByRole("dialog", {
    name: zh.promptTemplates.editor.edit,
    exact: true,
  });
  const content = prompt.locator("textarea:not([readonly])");
  await expect(content).toBeVisible();
  await content.fill("每个镜头只描述一个清晰的动作，保持角色外观一致。");
  await prompt
    .getByRole("button", { name: zh.promptTemplates.editor.save, exact: true })
    .click();
  await expect(
    page.getByText(zh.promptTemplates.editor.savedSuccess, { exact: true }),
  ).toBeVisible();
  await expect(
    prompt.getByRole("button", {
      name: zh.promptTemplates.editor.save,
      exact: true,
    }),
  ).toBeDisabled();
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("prompt-drawer-phone.png"),
  });
  await prompt
    .getByRole("button", { name: zh.workspace.close, exact: true })
    .click();
  await page
    .getByRole("button", { name: zh.promptTemplates.editPrompt, exact: true })
    .click();
  await expect(content).toHaveValue(
    "每个镜头只描述一个清晰的动作，保持角色外观一致。",
  );
});

test("preview switches between the final film and shot clips in a single player", async ({
  page,
  project,
}) => {
  const clip = path.join(process.env.UPLOAD_DIR!, "clip.mp4");
  db.update(episodes)
    .set({ finalVideoUrl: clip })
    .where(eq(episodes.id, project.episodeId))
    .run();
  await page.goto(project.storyboardUrl.replace("/storyboard", "/preview"));
  const final = page.getByRole("button", {
    name: zh.project.finalVideo,
    exact: true,
  });
  await expect(final).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.locator("video")).not.toHaveAttribute("autoplay");
  await page
    .getByRole("button", { name: zh.workspace.clips, exact: true })
    .click();
  await expect(final).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("combobox", { name: zh.workspace.clips, exact: true })
    .selectOption("reference");
  await expect(page.locator("video")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: zh.workspace.previousShot }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: zh.workspace.nextShot }),
  ).toBeDisabled();
  await final.click();
  await expect(final).toHaveAttribute("aria-pressed", "true");
});

test("episodes can be renamed from the list without opening the editor", async ({
  page,
  project,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/zh/project/${project.projectId}/episodes`);
  await page
    .getByRole("button", { name: `${zh.episode.edit} Forest`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: zh.episode.edit,
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: zh.episode.title, exact: true })
    .fill("归途");
  await dialog
    .getByRole("textbox", { name: zh.episode.description, exact: true })
    .fill("林夏沿着旧铁轨回到故乡。");
  await expectNoOverflow(page);
  await dialog
    .getByRole("button", { name: zh.common.confirm, exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "归途", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "归途", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: zh.workspace.workflow }),
  ).toBeVisible();
  expect(
    db.select().from(episodes).where(eq(episodes.id, project.episodeId)).get()
      ?.title,
  ).toBe("归途");
});

test("expanded editing views remain usable on a phone", async ({
  page,
  project,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(project.storyboardUrl);
  await page
    .getByText(zh.workspace.generationSettings, { exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: zh.project.generateShots, exact: true })
      .last(),
  ).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("generation-settings-phone.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: zh.project.compareVersions, exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Version A", exact: true }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await page
    .getByRole("button", { name: zh.project.exitCompare, exact: true })
    .click();
  await page
    .getByRole("button", { name: zh.project.viewKanban, exact: true })
    .click();
  await expectNoOverflow(page);
  await page.goto("/zh/settings/prompts");
  await page
    .getByText(zh.promptTemplates.editor.previewFull, { exact: true })
    .first()
    .click();
  await expectNoOverflow(page);
  await page
    .getByRole("button", {
      name: zh.promptTemplates.editor.advancedMode,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: zh.promptTemplates.editor.advancedMode,
      exact: true,
    }),
  ).not.toHaveValue("");
  await expectNoOverflow(page);
});

test("localized navigation fits a phone and keeps the selected storyboard version", async ({
  page,
  project,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (/MISSING_MESSAGE|INVALID_MESSAGE/.test(message.text()))
      errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${project.storyboardUrl}?versionId=${project.oldVersion.id}`,
  );
  for (const locale of ["en", "ja", "ko", "zh"]) {
    await page.locator("header select").selectOption(locale);
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/project/.*versionId=${project.oldVersion.id}`),
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoOverflow(page);
  }
  expect(errors).toEqual([]);
});
