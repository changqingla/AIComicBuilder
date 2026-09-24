"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useModelGuard } from "@/hooks/use-model-guard";
import { apiFetch } from "@/lib/api-fetch";
import type { ShotAsset } from "@/lib/shot-assets";
import { useModelStore } from "@/stores/model-store";
import type { ShotEditorProps } from "@/components/editor/shot-editor/types";

export type ShotGenerationStep = "text" | "frames" | "prompt" | "video";

export function useShotGeneration({
  projectId,
  shot,
  versionId,
  videoRatio,
  generationMode,
  onUpdate,
}: ShotEditorProps) {
  const t = useTranslations();
  const imageGuard = useModelGuard("image");
  const videoGuard = useModelGuard("video");
  const textGuard = useModelGuard("text");
  const [pending, setPending] = useState<ShotGenerationStep | null>(null);
  const running = useRef(false);

  async function run(step: ShotGenerationStep, asset?: ShotAsset) {
    if (running.current) return;
    const reference = generationMode === "reference";
    const modelStore = useModelStore.getState();
    const modelConfig = modelStore.getModelConfig();
    if (asset?.modelProvider && asset.modelId) {
      const provider = modelStore.providers.find(
        (p) => p.id === asset.modelProvider,
      );
      if (provider) modelConfig.image = { ...provider, modelId: asset.modelId };
    }
    if (step === "frames" && !modelConfig.image && !imageGuard()) return;
    if (step === "video" && !videoGuard()) return;
    if (
      step === "prompt" &&
      !textGuard(reference ? "ref_video_prompts" : "video_prompts", projectId)
    )
      return;
    if (step === "text" && !textGuard()) return;
    const actions = {
      text: "single_shot_rewrite",
      frames: asset
        ? "single_ref_image_generate"
        : reference
          ? "single_ref_image_generate_all"
          : "single_frame_generate",
      prompt: "single_video_prompt",
      video: reference ? "single_reference_video" : "single_video_generate",
    };
    running.current = true;
    setPending(step);
    try {
      await apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actions[step],
          modelConfig,
          payload: {
            shotId: shot.id,
            versionId: versionId ?? undefined,
            ratio: videoRatio,
            refImageId: asset?.id,
            overwrite: true,
          },
        }),
      });
      await onUpdate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.generationFailed"),
      );
    } finally {
      running.current = false;
      setPending(null);
    }
  }
  return { pending, run };
}
