"use client";

import { useState } from "react";
import pMap from "p-map";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useModelStore } from "@/stores/model-store";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";

const singleActions = {
  batch_frame_generate: "single_frame_generate",
  batch_video_generate: "single_video_generate",
  batch_scene_frame: "single_ref_image_generate_all",
  batch_reference_video: "single_reference_video",
  batch_video_prompt: "single_video_prompt",
} as const;
type BatchAction = keyof typeof singleActions;
type Result = {
  shotId: string;
  status: "ok" | "skipped" | "error";
  error?: string;
};

export function useBatchGeneration(scope: {
  projectId: string;
  episodeId: string;
  versionId: string | null;
  ratio: string;
  total: number;
}) {
  const [active, setActive] = useState<{
    action: BatchAction;
    overwrite: boolean;
  } | null>(null);
  const [progress, setProgress] = useState<{
    total: number;
    completed: number;
    failed: string[];
  } | null>(null);
  const [failed, setFailed] = useState<{
    action: BatchAction;
    shotIds: string[];
    scope: typeof scope;
  } | null>(null);

  async function execute(
    action: BatchAction,
    overwrite = false,
    versionIdOverride?: string,
    retry?: typeof failed,
  ) {
    const requestScope = retry?.scope ?? {
      ...scope,
      versionId: versionIdOverride ?? scope.versionId,
    };
    const { projectId, episodeId, versionId, ratio } = requestScope;
    const modelConfig = useModelStore.getState().getModelConfig();
    const send = (action: string, shotId?: string) =>
      apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          episodeId,
          modelConfig,
          payload: {
            ratio,
            overwrite,
            versionId: versionId ?? undefined,
            shotId,
          },
        }),
      });
    setActive({ action, overwrite });
    setProgress({
      total: retry?.shotIds.length ?? requestScope.total,
      completed: 0,
      failed: [],
    });
    try {
      const results: Result[] = retry
        ? await pMap(
            retry.shotIds,
            async (shotId): Promise<Result> => {
              let result: Result;
              try {
                await send(singleActions[action], shotId);
                result = { shotId, status: "ok" };
              } catch (error) {
                result = { shotId, status: "error", error: String(error) };
              }
              setProgress((previous) =>
                previous
                  ? {
                      ...previous,
                      completed: previous.completed + 1,
                      failed:
                        result.status === "error"
                          ? [...previous.failed, shotId]
                          : previous.failed,
                    }
                  : null,
              );
              return result;
            },
            { concurrency: 3 },
          )
        : (await (await send(action)).json()).results;
      const errors = results.filter((result) => result.status === "error");
      setFailed(
        errors.length
          ? {
              action,
              scope: requestScope,
              shotIds: errors.map((result) => result.shotId),
            }
          : null,
      );
      if (errors.length)
        toast.error(
          `${errors.length}/${results.length} shots failed: ${errors[0].error ?? "Generation failed"}`,
        );
      else
        toast.success(
          `${results.filter((result) => result.status === "ok").length} shots completed`,
        );
      return errors.length === 0;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
      return false;
    } finally {
      await useEpisodeEditorStore
        .getState()
        .fetchEpisode(projectId, episodeId, versionId ?? undefined);
      setActive(null);
      setProgress(null);
    }
  }
  return {
    active,
    progress,
    failedShotIds: failed?.shotIds ?? [],
    run: execute,
    retry: () =>
      failed
        ? execute(failed.action, false, undefined, failed)
        : Promise.resolve(true),
  };
}
