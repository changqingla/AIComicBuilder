import { test as base, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  episodes,
  characters,
  episodeCharacters,
  storyboardVersions,
  shots,
  shotAssets,
} from "@/lib/db/schema";

function seedProject() {
  const projectId = randomUUID();
  const episodeId = randomUUID();
  const userId = randomUUID();
  const characterId = randomUUID();
  const image = path.join(process.env.UPLOAD_DIR!, "frame.png");
  db.insert(projects)
    .values({ id: projectId, userId, title: "Browser regression" })
    .run();
  db.insert(episodes)
    .values({
      id: episodeId,
      projectId,
      title: "Forest",
      sequence: 1,
      script: "SCENE 1\nAlice walks into a forest.",
    })
    .run();
  db.insert(characters)
    .values({
      id: characterId,
      projectId,
      name: "Alice",
      description: "A traveler",
      referenceImage: image,
    })
    .run();
  db.insert(episodeCharacters)
    .values({ id: randomUUID(), episodeId, characterId })
    .run();
  const versions = ["Old version", "Current version"].map((label, index) => {
    const id = randomUUID();
    db.insert(storyboardVersions)
      .values({ id, projectId, episodeId, label, versionNum: index + 1 })
      .run();
    const shotId = randomUUID();
    db.insert(shots)
      .values({
        id: shotId,
        projectId,
        episodeId,
        versionId: id,
        sequence: 1,
        prompt: `${label} forest scene`,
        videoPrompt: "Original video prompt",
        duration: 1,
      })
      .run();
    for (const type of [
      "first_frame",
      "last_frame",
      "reference",
      "keyframe_video",
      "reference_video",
    ] as const) {
      db.insert(shotAssets)
        .values({
          id: `${shotId}-${type}`,
          shotId,
          type,
          prompt: "Original prompt",
          fileUrl: type.includes("video")
            ? path.join(process.env.UPLOAD_DIR!, "clip.mp4")
            : image,
          status: "completed",
          characters: JSON.stringify(["Alice"]),
        })
        .run();
    }
    return { id, shotId, label };
  });
  return {
    projectId,
    episodeId,
    userId,
    image,
    oldVersion: versions[0],
    currentVersion: versions[1],
    storyboardUrl: `/zh/project/${projectId}/episodes/${episodeId}/storyboard`,
  };
}

export const test = base.extend<{ project: ReturnType<typeof seedProject> }>({
  project: async ({ page, baseURL }, provide) => {
    const project = seedProject();
    await page
      .context()
      .addCookies([
        { name: "ai_comic_uid", value: project.userId, url: baseURL! },
      ]);
    await page.addInitScript((userId) => {
      localStorage.setItem("ai_comic_uid", userId);
      const providers = ["text", "image", "video"].map((capability) => ({
        id: capability,
        name: capability,
        capability,
        protocol: "openai",
        baseUrl: "https://example.invalid",
        apiKey: "test",
        models: [{ id: "test", name: "Test", checked: true }],
      }));
      localStorage.setItem(
        "model-store",
        JSON.stringify({
          version: 2,
          state: {
            providers,
            defaultTextModel: { providerId: "text", modelId: "test" },
            defaultImageModel: { providerId: "image", modelId: "test" },
            defaultVideoModel: { providerId: "video", modelId: "test" },
          },
        }),
      );
    }, project.userId);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await provide(project);
    expect(errors).toEqual([]);
    db.delete(projects).where(eq(projects.id, project.projectId)).run();
  },
});

export { expect, db };
