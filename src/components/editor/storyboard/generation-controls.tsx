"use client";

import { AgentPicker } from "@/components/agent-picker";
import { Button } from "@/components/ui/button";
import type { StoryboardGeneration } from "@/hooks/use-storyboard-generation";
import {
  getFirstFramePrompt,
  getFirstFrameUrl,
  getLastFramePrompt,
  getLastFrameUrl,
  getReferenceAssets,
  hasAllReferenceImages,
  hasKeyframePair,
} from "@/lib/shot-assets";
import type { EpisodeDetail } from "@/stores/episode-editor-store";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { InlineModelPicker } from "../model-selector";
import { VideoRatioPicker } from "../video-ratio-picker";

export function GenerationControls({
  episode,
  workflow,
  ratio,
  onRatioChange,
}: {
  episode: EpisodeDetail;
  workflow: StoryboardGeneration;
  ratio: string;
  onRatioChange: (ratio: string) => void;
}) {
  const t = useTranslations();
  const { shots } = episode;
  const reference = episode.generationMode === "reference";
  const { busy, pending, generating, batch } = workflow;
  const hasPrompts = shots.some((shot) =>
    reference
      ? getReferenceAssets(shot).some((a) => a.prompt.trim())
      : getFirstFramePrompt(shot) && getLastFramePrompt(shot),
  );
  const hasFrames = shots.some((shot) =>
    reference
      ? getReferenceAssets(shot).some((a) => a.fileUrl)
      : getFirstFrameUrl(shot) || getLastFrameUrl(shot),
  );
  const readyForVideo =
    shots.length > 0 &&
    shots.every(
      (shot) =>
        shot.videoPrompt &&
        (reference ? hasAllReferenceImages(shot) : hasKeyframePair(shot)),
    );
  const rowClass =
    "flex min-w-0 flex-wrap items-center gap-3 border-b border-border py-4";
  return (
    <div className="space-y-1">
      <div className={rowClass}>
        <span className="w-full text-sm font-medium lg:w-28 lg:shrink-0">
          {t("project.workflowStepShots")}
        </span>
        <AgentPicker projectId={episode.projectId} category="shot_split" />
        <InlineModelPicker capability="text" />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => workflow.generateShots()}
        >
          {t(
            pending === "shots" ? "common.generating" : "project.generateShots",
          )}
        </Button>
      </div>
      <div className={rowClass}>
        <span className="w-full text-sm font-medium lg:w-28 lg:shrink-0">
          {t(
            reference
              ? "project.workflowStepSceneFrames"
              : "project.workflowStepFrames",
          )}
        </span>
        <AgentPicker
          projectId={episode.projectId}
          category={reference ? "ref_image_prompts" : "keyframe_prompts"}
        />
        <InlineModelPicker capability="image" />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !shots.length}
          onClick={() => workflow.generatePrompts()}
        >
          {t(
            pending === "prompts"
              ? "common.generating"
              : reference
                ? "storyboard.generateRefPrompts"
                : "storyboard.generateKeyframePrompts",
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !hasPrompts}
          onClick={() => workflow.generateFrames()}
        >
          {t(
            generating.frames
              ? "common.generating"
              : reference
                ? "storyboard.batchGenerateRefImages"
                : "project.batchGenerateFrames",
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !hasPrompts}
          aria-label={t("project.batchGenerateFramesOverwrite")}
          onClick={() => workflow.generateFrames(true)}
        >
          {t("shot.regenerateFrames")}
        </Button>
      </div>
      <div className={rowClass}>
        <span className="w-full text-sm font-medium lg:w-28 lg:shrink-0">
          {t("project.workflowStepVideoPrompts")}
        </span>
        <AgentPicker
          projectId={episode.projectId}
          category={reference ? "ref_video_prompts" : "video_prompts"}
        />
        <InlineModelPicker capability="text" />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !hasFrames}
          onClick={() => workflow.generateVideoPrompts()}
        >
          {t(
            generating.videoPrompts
              ? "common.generating"
              : "project.batchGenerateVideoPrompts",
          )}
        </Button>
      </div>
      <div className={rowClass}>
        <span className="w-full text-sm font-medium lg:w-28 lg:shrink-0">
          {t("shot.stepVideo")}
        </span>
        <InlineModelPicker capability="video" />
        <VideoRatioPicker value={ratio} onChange={onRatioChange} />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !readyForVideo}
          onClick={() => workflow.generateVideos()}
        >
          {t(
            generating.videos
              ? "common.generating"
              : reference
                ? "project.batchGenerateReferenceVideos"
                : "project.batchGenerateVideos",
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !readyForVideo}
          aria-label={t("project.batchGenerateVideosOverwrite")}
          onClick={() => workflow.generateVideos(true)}
        >
          {t("shot.regenerateVideo")}
        </Button>
      </div>
      {shots.length > 0 && (
        <div className={"flex flex-wrap items-center gap-3 pt-4"}>
          <Button size="sm" disabled={busy} onClick={workflow.autoRun}>
            {t("project.autoRun")}
          </Button>
          {batch.failedShotIds.length > 0 && !batch.progress && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={batch.retry}
              className="text-destructive"
            >
              {t("common.retry")} ({batch.failedShotIds.length})
            </Button>
          )}
        </div>
      )}
      {batch.progress && (
        <div className="col-span-full flex items-center gap-3 py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <progress
            className="min-w-0 flex-1"
            max={batch.progress.total || 1}
            value={batch.progress.completed}
          />
          <span className="text-sm tabular-nums">
            {batch.progress.completed}/{batch.progress.total}
          </span>
          {!!batch.progress.failed.length && (
            <span className="text-sm text-destructive">
              ({batch.progress.failed.length})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
