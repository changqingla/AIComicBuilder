"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/utils/upload-url";
import type { StoryboardGeneration } from "@/hooks/use-storyboard-generation";
import { type Shot } from "@/lib/editor-types";
import {
  getFirstFrameUrl,
  getLastFrameUrl,
  getSceneRefFrameUrl,
  getKeyframeVideoUrl,
  getReferenceVideoUrl,
} from "@/lib/shot-assets";

type KanbanShot = Shot;

interface ShotKanbanProps {
  shots: KanbanShot[];
  generationMode: "keyframe" | "reference";
  workflow: StoryboardGeneration;
  onOpenDrawer: (id: string) => void;
}

interface KanbanColumn {
  key: string;
  labelKey: string;
  shots: KanbanShot[];
  batchAction?: () => void;
  isGenerating?: boolean;
}

function classifyShot(shot: KanbanShot, mode: "keyframe" | "reference") {
  // In reference mode, only sceneRefFrame counts as "has frame"
  const hasFrame =
    mode === "reference"
      ? !!getSceneRefFrameUrl(shot)
      : !!(getFirstFrameUrl(shot) || getLastFrameUrl(shot));
  const hasVideoPrompt = !!shot.videoPrompt;
  const hasVideo = !!(mode === "reference"
    ? getReferenceVideoUrl(shot)
    : getKeyframeVideoUrl(shot));
  if (!hasFrame) return "frames";
  if (!hasVideoPrompt) return "prompt";
  if (!hasVideo) return "video";
  return "done";
}

export function ShotKanban({
  shots,
  generationMode,
  workflow,
  onOpenDrawer,
}: ShotKanbanProps) {
  const t = useTranslations("project");
  const tCommon = useTranslations("common");

  const frameShots = shots.filter(
    (s) => classifyShot(s, generationMode) === "frames",
  );
  const promptShots = shots.filter(
    (s) => classifyShot(s, generationMode) === "prompt",
  );
  const videoShots = shots.filter(
    (s) => classifyShot(s, generationMode) === "video",
  );
  const doneShots = shots.filter(
    (s) => classifyShot(s, generationMode) === "done",
  );

  const anyGenerating = workflow.busy;
  const {
    frames: framesGenerating,
    videoPrompts: generatingVideoPrompts,
    videos: generatingVideos,
  } = workflow.generating;

  const columns: KanbanColumn[] = [
    {
      key: "frames",
      labelKey: "kanbanNeedsFrames",
      shots: frameShots,
      batchAction: () => workflow.generateFrames(),
      isGenerating: framesGenerating,
    },
    {
      key: "prompt",
      labelKey: "kanbanNeedsPrompt",
      shots: promptShots,
      batchAction: () => workflow.generateVideoPrompts(),
      isGenerating: generatingVideoPrompts,
    },
    {
      key: "video",
      labelKey: "kanbanNeedsVideo",
      shots: videoShots,
      batchAction: () => workflow.generateVideos(),
      isGenerating: generatingVideos,
    },
    {
      key: "done",
      labelKey: "kanbanDone",
      shots: doneShots,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {columns.map((col) => (
        <div key={col.key} className="min-w-0 border-t border-border">
          {/* Column header */}
          <div className="flex items-center gap-2 border-b border-border py-3">
            <span className="flex-1 text-sm font-medium">
              {t(col.labelKey as Parameters<typeof t>[0])}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {col.shots.length}
            </span>
          </div>

          {/* Batch button */}
          {col.batchAction && col.shots.length > 0 && (
            <div className="border-b border-[var(--border-subtle)] px-2 py-2">
              <Button
                size="xs"
                variant="outline"
                className="w-full"
                onClick={col.batchAction}
                disabled={anyGenerating}
              >
                {col.isGenerating
                  ? tCommon("generating")
                  : t("kanbanBatchGenerate", {
                      count: col.shots.length,
                    } as never)}
              </Button>
            </div>
          )}

          {/* Shot mini-cards */}
          <div className="flex-1 divide-y divide-border">
            {col.shots.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-xs text-[var(--text-muted)]">
                —
              </div>
            ) : (
              col.shots.map((shot) => {
                const thumb =
                  getFirstFrameUrl(shot) ||
                  getSceneRefFrameUrl(shot) ||
                  getLastFrameUrl(shot);
                return (
                  <div
                    key={shot.id}
                    className="flex cursor-pointer flex-col gap-3 py-4 transition-colors hover:bg-muted/50"
                    onClick={() => onOpenDrawer(shot.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenDrawer(shot.id);
                      }
                    }}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video w-full flex-shrink-0 overflow-hidden bg-muted">
                      {thumb ? (
                        <img
                          src={uploadUrl(thumb)}
                          alt={`Shot ${shot.sequence}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="text-xs text-muted-foreground">
                            {t("kanbanNeedsFrames")}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Text */}
                    <div className="min-w-0 w-full">
                      <div className="text-xs font-mono font-bold text-primary">
                        {shot.sequence.toString().padStart(2, "0")}
                      </div>
                      <div className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {shot.prompt}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
