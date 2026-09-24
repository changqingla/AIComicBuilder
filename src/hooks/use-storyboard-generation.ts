"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useBatchGeneration } from "./use-batch-generation";
import { useModelGuard } from "./use-model-guard";
import { apiFetch } from "@/lib/api-fetch";
import {
  getFirstFramePrompt,
  getLastFramePrompt,
  getReferenceAssets,
} from "@/lib/shot-assets";
import { useModelStore } from "@/stores/model-store";
import {
  useEpisodeEditorStore,
  type EpisodeDetail,
} from "@/stores/episode-editor-store";

export function useStoryboardGeneration(
  episode: EpisodeDetail,
  versionId: string | null,
  ratio: string,
  onVersionCreated: (id: string) => void,
) {
  const t = useTranslations();
  const textGuard = useModelGuard("text");
  const imageGuard = useModelGuard("image");
  const videoGuard = useModelGuard("video");
  const [pending, setPending] = useState<"shots" | "prompts" | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const reference = episode.generationMode === "reference";
  const batch = useBatchGeneration({
    projectId: episode.projectId,
    episodeId: episode.id,
    versionId,
    ratio,
    total: episode.shots.length,
  });
  const fetchEpisode = useEpisodeEditorStore((s) => s.fetchEpisode);

  function request(action: string, selectedVersion?: string | null) {
    return apiFetch(`/api/projects/${episode.projectId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        episodeId: episode.id,
        modelConfig: useModelStore.getState().getModelConfig(),
        payload: { versionId: selectedVersion ?? undefined },
      }),
    });
  }
  function report(error: unknown) {
    toast.error(
      error instanceof Error ? error.message : t("common.generationFailed"),
    );
  }
  async function generateShots() {
    if (!textGuard("shot_split", episode.projectId)) return null;
    setPending("shots");
    try {
      const result: { versionId: string } = await (
        await request("shot_split")
      ).json();
      await fetchEpisode(episode.projectId, episode.id, result.versionId);
      onVersionCreated(result.versionId);
      return result.versionId;
    } catch (error) {
      report(error);
      return null;
    } finally {
      setPending(null);
    }
  }
  async function generatePrompts(selectedVersion = versionId) {
    if (
      !textGuard(
        reference ? "ref_image_prompts" : "keyframe_prompts",
        episode.projectId,
      )
    )
      return false;
    setPending("prompts");
    try {
      await request(
        reference ? "generate_ref_prompts" : "generate_keyframe_prompts",
        selectedVersion,
      );
      await fetchEpisode(
        episode.projectId,
        episode.id,
        selectedVersion ?? undefined,
      );
      toast.success(t("common.generationCompleted"));
      return true;
    } catch (error) {
      report(error);
      return false;
    } finally {
      setPending(null);
    }
  }
  async function generateFrames(
    overwrite = false,
    selectedVersion = versionId,
  ) {
    if (!imageGuard()) return false;
    return batch.run(
      reference ? "batch_scene_frame" : "batch_frame_generate",
      overwrite,
      selectedVersion ?? undefined,
    );
  }
  async function generateVideoPrompts(
    overwrite = false,
    selectedVersion = versionId,
  ) {
    if (
      !textGuard(
        reference ? "ref_video_prompts" : "video_prompts",
        episode.projectId,
      )
    )
      return false;
    return batch.run(
      "batch_video_prompt",
      overwrite,
      selectedVersion ?? undefined,
    );
  }
  async function generateVideos(
    overwrite = false,
    selectedVersion = versionId,
  ) {
    if (!videoGuard()) return false;
    return batch.run(
      reference ? "batch_reference_video" : "batch_video_generate",
      overwrite,
      selectedVersion ?? undefined,
    );
  }
  async function autoRun() {
    if (!confirm(t("project.autoRunConfirm"))) return;
    setAutoRunning(true);
    try {
      let selectedVersion = versionId;
      let shots = episode.shots;
      if (
        !shots.length ||
        shots.some((shot) => !shot.prompt && !shot.motionScript)
      ) {
        selectedVersion = await generateShots();
        if (!selectedVersion) return;
        const current = useEpisodeEditorStore.getState().episode;
        if (current?.id !== episode.id) return;
        shots = current.shots;
      }
      if (!selectedVersion) return;
      const needsPrompts = shots.some((shot) =>
        reference
          ? !getReferenceAssets(shot).some((asset) => asset.prompt.trim())
          : !getFirstFramePrompt(shot) || !getLastFramePrompt(shot),
      );
      if (needsPrompts && !(await generatePrompts(selectedVersion))) return;
      if (!(await generateFrames(false, selectedVersion))) return;
      if (!(await generateVideoPrompts(false, selectedVersion))) return;
      await generateVideos(false, selectedVersion);
    } finally {
      setAutoRunning(false);
    }
  }
  const frames =
    batch.active?.action === "batch_scene_frame" ||
    batch.active?.action === "batch_frame_generate";
  const videos =
    batch.active?.action === "batch_reference_video" ||
    batch.active?.action === "batch_video_generate";
  return {
    busy: !!(pending || batch.active || autoRunning),
    pending,
    batch,
    generating: {
      frames,
      videoPrompts: batch.active?.action === "batch_video_prompt",
      videos,
    },
    generateShots,
    generatePrompts,
    generateFrames,
    generateVideoPrompts,
    generateVideos,
    autoRun,
  };
}
export type StoryboardGeneration = ReturnType<typeof useStoryboardGeneration>;
