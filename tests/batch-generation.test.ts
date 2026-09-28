// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useBatchGeneration } from "@/hooks/use-batch-generation";

const mocks = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: mocks.request }));
vi.mock("@/stores/model-store", () => ({
  useModelStore: { getState: () => ({ getModelConfig: () => ({}) }) },
}));
vi.mock("@/stores/episode-editor-store", () => ({
  useEpisodeEditorStore: { getState: () => ({ fetchEpisode: mocks.refresh }) },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("retrying a failed regeneration preserves overwrite and its original version", async () => {
  mocks.request
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            { shotId: "s", status: "error", error: "Provider unavailable" },
          ],
        }),
      ),
    )
    .mockResolvedValueOnce(new Response("{}"));
  const { result, rerender } = renderHook(
    ({ versionId }) =>
      useBatchGeneration({
        projectId: "p",
        episodeId: "ep",
        versionId,
        ratio: "16:9",
        total: 1,
      }),
    { initialProps: { versionId: "original" } },
  );
  await act(async () => {
    expect(await result.current.run("batch_video_prompt", true)).toBe(false);
  });
  rerender({ versionId: "newer" });
  expect(result.current.failedShotIds).toEqual([]);
  await act(async () => {
    await result.current.retry();
  });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  rerender({ versionId: "original" });
  expect(result.current.failedShotIds).toEqual(["s"]);
  await act(async () => {
    expect(await result.current.retry()).toBe(true);
  });
  const retry = JSON.parse(mocks.request.mock.calls[1][1].body);
  expect(retry).toMatchObject({
    action: "single_video_prompt",
    episodeId: "ep",
    payload: { shotId: "s", versionId: "original", overwrite: true },
  });
});
