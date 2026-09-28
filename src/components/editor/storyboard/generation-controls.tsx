"use client";

import { useTranslations } from "next-intl";
import {
  ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentPicker } from "@/components/agent-picker";
import { InlineModelPicker } from "../model-selector";
import { VideoRatioPicker } from "../video-ratio-picker";
import type { EpisodeDetail } from "@/stores/episode-editor-store";
import type { StoryboardGeneration } from "@/hooks/use-storyboard-generation";
import {
  getFirstFramePrompt,
  getLastFramePrompt,
  getReferenceAssets,
  hasAllReferenceImages,
  hasKeyframePair,
  getFirstFrameUrl,
  getLastFrameUrl,
} from "@/lib/shot-assets";

const StepNumber = ({ value }: { value: number }) => (
  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[--surface] text-xs text-[--text-muted]">
    {value}
  </span>
);

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
  const rowClass = "flex flex-wrap items-center gap-2";

  function icon(loading: boolean, Icon: typeof Sparkles) {
    return loading ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : (
      <Icon className="h-3.5 w-3.5" />
    );
  }
  return (
    <div className="space-y-2">
      <div className={rowClass}>
        <StepNumber value={1} />
        <AgentPicker projectId={episode.projectId} category="shot_split" />
        <InlineModelPicker capability="text" />
        <Button
          size="sm"
          disabled={busy}
          onClick={() => workflow.generateShots()}
        >
          {icon(pending === "shots", Sparkles)}
          {t(
            pending === "shots" ? "common.generating" : "project.generateShots",
          )}
        </Button>
      </div>
      <div className={rowClass}>
        <StepNumber value={2} />
        <AgentPicker
          projectId={episode.projectId}
          category={reference ? "ref_image_prompts" : "keyframe_prompts"}
        />
        <InlineModelPicker capability="image" />
        <Button
          size="sm"
          disabled={busy || !shots.length}
          onClick={() => workflow.generatePrompts()}
        >
          {icon(pending === "prompts", Sparkles)}
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
          disabled={busy || !hasPrompts}
          onClick={() => workflow.generateFrames()}
        >
          {icon(generating.frames && !batch.active?.overwrite, ImageIcon)}
          {t(
            generating.frames
              ? "common.generating"
              : reference
                ? "storyboard.batchGenerateRefImages"
                : "project.batchGenerateFrames",
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={busy || !hasPrompts}
          title={t("project.batchGenerateFramesOverwrite")}
          onClick={() => workflow.generateFrames(true)}
        >
          {icon(generating.frames && !!batch.active?.overwrite, RefreshCw)}
        </Button>
      </div>
      <div className={rowClass}>
        <StepNumber value={3} />
        <AgentPicker
          projectId={episode.projectId}
          category={reference ? "ref_video_prompts" : "video_prompts"}
        />
        <InlineModelPicker capability="text" />
        <Button
          size="sm"
          disabled={busy || !hasFrames}
          onClick={() => workflow.generateVideoPrompts()}
        >
          {icon(generating.videoPrompts, Sparkles)}
          {t(
            generating.videoPrompts
              ? "common.generating"
              : "project.batchGenerateVideoPrompts",
          )}
        </Button>
      </div>
      <div className={rowClass}>
        <StepNumber value={4} />
        <InlineModelPicker capability="video" />
        <VideoRatioPicker value={ratio} onChange={onRatioChange} />
        <Button
          size="sm"
          disabled={busy || !readyForVideo}
          onClick={() => workflow.generateVideos()}
        >
          {icon(generating.videos && !batch.active?.overwrite, VideoIcon)}
          {t(
            generating.videos
              ? "common.generating"
              : reference
                ? "project.batchGenerateReferenceVideos"
                : "project.batchGenerateVideos",
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={busy || !readyForVideo}
          title={t("project.batchGenerateVideosOverwrite")}
          onClick={() => workflow.generateVideos(true)}
        >
          {icon(generating.videos && !!batch.active?.overwrite, RefreshCw)}
        </Button>
      </div>
      {shots.length > 0 && (
        <div className={`${rowClass} border-t border-[--border-subtle] pt-2`}>
          <Button size="sm" disabled={busy} onClick={workflow.autoRun}>
            {icon(busy, Play)}
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
              <RefreshCw className="h-4 w-4" />
              {t("common.retry")} ({batch.failedShotIds.length})
            </Button>
          )}
        </div>
      )}
      {batch.progress && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
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
