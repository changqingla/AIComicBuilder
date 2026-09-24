import { beforeAll, expect, test, vi } from "vitest";
import { db, runMigrations } from "@/lib/db";
import { projects, shots } from "@/lib/db/schema";
import {
  getActiveAsset,
  getAssetHistory,
  insertAssetVersion,
  patchAsset,
} from "@/lib/shot-asset-utils";
import { POST as upload } from "@/app/api/projects/[id]/shots/[shotId]/upload/route";
import { PUT as replace } from "@/app/api/projects/[id]/shots/[shotId]/assets/route";
import {
  handleSingleFrameGenerate,
  handleBatchFrameGenerate,
} from "@/lib/generation/frames";

const image = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/provider-factory", () => ({
  resolveImageProvider: () => ({ generateImage: image }),
}));
vi.mock("@/lib/ai/prompts/resolver", () => ({
  resolveSlotContents: async () => ({}),
}));
const params = Promise.resolve({ id: "p", shotId: "s" });
const config = {
  image: {
    protocol: "openai",
    baseUrl: "https://example.invalid",
    apiKey: "test",
    modelId: "test",
  },
};

beforeAll(() => {
  runMigrations();
  db.insert(projects).values({ id: "p", title: "Test", userId: "owner" }).run();
  db.insert(shots)
    .values({ id: "s", projectId: "p", sequence: 3, prompt: "A scene" })
    .run();
});

test("uploads create versions, and clearing one type preserves other types and history", async () => {
  for (let i = 0; i < 2; i++) {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "frame.png", {
        type: "image/png",
      }),
    );
    form.set("type", "first_frame");
    form.set("sequenceInType", "0");
    const response = await upload(
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-user-id": "owner" },
        body: form,
      }),
      { params },
    );
    expect(response.status).toBe(200);
  }
  expect(await getAssetHistory("s", "first_frame")).toHaveLength(2);
  insertAssetVersion({
    shotId: "s",
    type: "last_frame",
    prompt: "last",
    fileUrl: "last.png",
  });
  const response = await replace(
    new Request("http://localhost", {
      method: "PUT",
      headers: { "x-user-id": "owner", "Content-Type": "application/json" },
      body: JSON.stringify({ type: "first_frame", items: [] }),
    }),
    { params },
  );
  expect(response.status).toBe(200);
  expect(await getActiveAsset("s", "first_frame")).toBeNull();
  expect((await getActiveAsset("s", "last_frame"))?.fileUrl).toBe("last.png");
  expect(await getAssetHistory("s", "first_frame")).toHaveLength(2);
});

test("single and batch generation append history; failure preserves existing frames", async () => {
  const input = {
    action: "single_frame_generate" as const,
    projectId: "p",
    userId: "owner",
    modelConfig: config,
    payload: { shotId: "s", overwrite: true },
  };
  image
    .mockResolvedValueOnce("first-new.png")
    .mockResolvedValueOnce("last-new.png");
  await handleSingleFrameGenerate(input);
  image
    .mockResolvedValueOnce("first-batch.png")
    .mockResolvedValueOnce("last-batch.png");
  expect((await handleBatchFrameGenerate(input)).results[0].status).toBe("ok");
  expect(await getAssetHistory("s", "first_frame")).toHaveLength(4);
  image
    .mockResolvedValueOnce("unused-first.png")
    .mockRejectedValueOnce(new Error("Provider unavailable"));
  const failed = await handleBatchFrameGenerate(input);
  expect(failed.results[0]).toMatchObject({
    shotId: "s",
    sequence: 3,
    status: "error",
    error: "Provider unavailable",
  });
  expect((await getActiveAsset("s", "first_frame"))?.fileUrl).toBe(
    "first-batch.png",
  );
  expect((await getActiveAsset("s", "last_frame"))?.fileUrl).toBe(
    "last-batch.png",
  );
});

test("adding a reference image cannot overwrite a prompt edited after the list was loaded", async () => {
  const existing = insertAssetVersion({
    shotId: "s",
    type: "reference",
    prompt: "Original prompt",
  });
  await patchAsset(existing.id, { prompt: "Latest saved prompt" });
  const response = await replace(
    new Request("http://localhost", {
      method: "PUT",
      headers: { "x-user-id": "owner", "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "reference",
        items: [existing, { sequenceInType: 1, prompt: "Another image" }],
      }),
    }),
    { params },
  );
  expect(response.status).toBe(200);
  expect((await getActiveAsset("s", "reference", 0))?.prompt).toBe(
    "Latest saved prompt",
  );
  expect((await getActiveAsset("s", "reference", 1))?.prompt).toBe(
    "Another image",
  );
});
