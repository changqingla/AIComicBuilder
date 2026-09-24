import { beforeAll, expect, test } from "vitest";
import { db, runMigrations } from "@/lib/db";
import { projects, shots, shotAssets } from "@/lib/db/schema";
import { insertAssetVersion, activateAssetVersion, getActiveAsset, getAssetHistory } from "@/lib/shot-asset-utils";

beforeAll(() => {
  runMigrations();
  db.insert(projects).values({ id: "p", title: "Test" }).run();
  db.insert(shots).values({ id: "s", projectId: "p", sequence: 1 }).run();
});

test("concurrent results preserve history and have one active version", async () => {
  const result = await Promise.all([1, 2, 3].map((i) => insertAssetVersion({
    shotId: "s", type: "first_frame", prompt: "Frame", fileUrl: `image-${i}.png`, status: "completed",
  })));
  expect(result.map((asset) => asset.assetVersion)).toEqual([1, 2, 3]);
  expect((await getActiveAsset("s", "first_frame"))?.fileUrl).toBe("image-3.png");
  expect(await getAssetHistory("s", "first_frame")).toHaveLength(3);
  await activateAssetVersion("s", "first_frame", 0, 1);
  expect((await getActiveAsset("s", "first_frame"))?.fileUrl).toBe("image-1.png");
  await expect(activateAssetVersion("s", "first_frame", 0, 99)).rejects.toThrow("not found");
  expect((await getActiveAsset("s", "first_frame"))?.fileUrl).toBe("image-1.png");
});

test("the database rejects a second active asset in the same position", async () => {
  await insertAssetVersion({ shotId: "s", type: "last_frame", prompt: "Last" });
  expect(() => db.insert(shotAssets).values({
    id: "conflict", shotId: "s", type: "last_frame", assetVersion: 2, prompt: "Conflict",
  }).run()).toThrow();
  expect(await getAssetHistory("s", "last_frame")).toHaveLength(1);
});
