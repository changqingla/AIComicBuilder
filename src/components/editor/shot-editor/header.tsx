"use client";

import { useAutosave } from "@/hooks/use-autosave";
import { useDraft } from "@/hooks/use-draft";
import { useShotMutations } from "@/hooks/use-shot-mutations";
import {
  getFirstFrameUrl,
  getKeyframeVideoUrl,
  getLastFrameUrl,
  getReferenceVideoUrl,
  getSceneRefFrameUrl,
} from "@/lib/shot-assets";
import { uploadUrl } from "@/lib/utils/upload-url";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { Media } from "./media-preview";
import type { ShotEditorProps } from "./types";

const transitions = [
  "cut",
  "dissolve",
  "fade_in",
  "fade_out",
  "wipeleft",
  "slideright",
  "circleopen",
];
export function ShotHeader({
  editor,
  compact,
  onOpen,
  onPreview,
}: {
  editor: ShotEditorProps;
  compact?: boolean;
  onOpen?: () => void;
  onPreview?: (media: Media) => void;
}) {
  const { shot, generationMode } = editor;
  const t = useTranslations();
  const { updateShot } = useShotMutations(
    editor.projectId,
    shot.id,
    editor.onUpdate,
  );
  const [duration, setDuration] = useDraft(shot.duration, {
    preserveUnsaved: true,
  });
  const saveDuration = useAutosave((duration: number) =>
    updateShot({ duration }),
  );
  const [copied, setCopied] = useState(false);
  const frames =
    generationMode === "reference"
      ? [{ url: getSceneRefFrameUrl(shot), label: t("shot.sceneRefFrame") }]
      : [
          { url: getFirstFrameUrl(shot), label: t("shot.firstFrame") },
          { url: getLastFrameUrl(shot), label: t("shot.lastFrame") },
        ];
  const video =
    generationMode === "reference"
      ? getReferenceVideoUrl(shot)
      : getKeyframeVideoUrl(shot);
  const media = [
    ...frames.map((f) => ({ ...f, kind: "image" as const })),
    { url: video, label: t("shot.stepVideo"), kind: "video" as const },
  ];
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        shot.videoPrompt ||
          `${shot.videoScript || shot.motionScript || shot.prompt}\nCamera: ${shot.cameraDirection}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error(String(error));
    }
  }
  if (compact) {
    return (
      <div className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-6 lg:grid-cols-[32px_176px_minmax(0,1fr)_120px] lg:gap-x-6">
        <button
          onClick={onOpen}
          aria-label={`${t("shot.editDetails")} ${shot.sequence}`}
          className="py-1 text-left text-sm tabular-nums text-muted-foreground"
        >
          {shot.sequence.toString().padStart(2, "0")}
        </button>
        <button
          onClick={onOpen}
          aria-label={frames[0].label}
          className="block aspect-video w-full overflow-hidden border border-border bg-muted lg:w-44"
        >
          {frames[0].url ? (
            <img
              src={uploadUrl(frames[0].url)}
              alt={frames[0].label}
              className="size-full object-cover"
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              {t("storyboard.noFrame")}
            </span>
          )}
        </button>
        <div className="col-start-2 min-w-0 lg:col-start-auto">
          <button
            onClick={onOpen}
            className="w-full text-left text-[15px] leading-7 hover:underline"
          >
            {shot.prompt}
          </button>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>{shot.duration}s</span>
            {shot.isStale ? <span>{t("storyboard.stale")}</span> : null}
            <button
              onClick={onOpen}
              className="underline-offset-4 hover:underline"
            >
              {t("shot.editDetails")}
            </button>
          </div>
        </div>
        <button
          onClick={onOpen}
          aria-label={t("shot.stepVideo")}
          className="col-start-2 flex items-center gap-3 text-sm text-muted-foreground lg:col-start-auto lg:block"
        >
          {video && (
            <video
              src={uploadUrl(video)}
              muted
              preload="metadata"
              className="aspect-video w-24 bg-muted object-cover lg:mb-2 lg:w-full"
            />
          )}
          <span>{t(video ? "shot.stepVideo" : "episode.videoPending")}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4 pb-5">
      <div className="grid grid-cols-3 gap-3">
        {media.map((item) => (
          <button
            key={item.label}
            aria-label={item.label}
            disabled={!item.url}
            onClick={() => item.url && onPreview?.({ ...item, url: item.url })}
            className="min-w-0 text-left text-sm text-muted-foreground"
          >
            <div className="mb-2 flex aspect-video items-center justify-center overflow-hidden bg-muted">
              {item.url ? (
                item.kind === "video" ? (
                  <video
                    src={uploadUrl(item.url)}
                    muted
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : (
                  <img
                    src={uploadUrl(item.url)}
                    alt={item.label}
                    className="size-full object-cover"
                  />
                )
              ) : (
                <span>{t("storyboard.noFrame")}</span>
              )}
            </div>
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          {t("shot.duration")}
          <input
            type="number"
            min={5}
            max={15}
            value={duration}
            onChange={(event) => {
              const next = Math.min(
                15,
                Math.max(5, Number(event.target.value)),
              );
              setDuration(next);
              saveDuration.schedule(next);
            }}
            onBlur={() => {
              void saveDuration.flush();
            }}
            className="h-8 w-14 border border-input px-2 text-foreground"
          />
        </label>
        {(["transitionIn", "transitionOut"] as const).map((field) => (
          <label key={field} className="flex items-center gap-2">
            {t(`workspace.${field}`)}
            <select
              value={shot[field] || "cut"}
              onChange={(event) => updateShot({ [field]: event.target.value })}
              className="h-8 border border-input bg-white px-2 text-foreground"
            >
              {transitions.map((value) => (
                <option key={value} value={value}>
                  {t(`shot.trans_${value}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button onClick={copy} className="underline-offset-4 hover:underline">
          {copied ? t("workspace.copied") : t("shot.copyPrompt")}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {shot.compositionGuide && (
          <span>{shot.compositionGuide.replaceAll("_", " ")}</span>
        )}
        {shot.focalPoint && (
          <span>
            {t("shot.focus")}: {shot.focalPoint}
          </span>
        )}
        {shot.depthOfField && shot.depthOfField !== "medium" && (
          <span>
            {t("shot.dof")}: {shot.depthOfField}
          </span>
        )}
        {shot.soundDesign && (
          <span>
            {t("shot.sfx")}: {shot.soundDesign}
          </span>
        )}
        {shot.musicCue && (
          <span>
            {t("shot.music")}: {shot.musicCue}
          </span>
        )}
      </div>
    </div>
  );
}
