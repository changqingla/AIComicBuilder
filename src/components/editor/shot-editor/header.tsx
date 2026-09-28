"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clock, Copy, ImageIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { useDraft } from "@/hooks/use-draft";
import { useAutosave } from "@/hooks/use-autosave";
import { useShotMutations } from "@/hooks/use-shot-mutations";
import {
  getFirstFrameUrl,
  getLastFrameUrl,
  getSceneRefFrameUrl,
  getKeyframeVideoUrl,
  getReferenceVideoUrl,
} from "@/lib/shot-assets";
import { uploadUrl } from "@/lib/utils/upload-url";
import type { ShotEditorProps } from "./types";
import type { Media } from "./media-preview";

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
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <button
        onClick={onOpen}
        aria-label={`Open editor ${shot.sequence}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border font-mono text-sm font-medium text-muted-foreground"
      >
        {shot.sequence}
      </button>
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 sm:flex sm:flex-none">
        {media.map((item) => (
          <button
            key={item.label}
            aria-label={item.label}
            onClick={() =>
              compact
                ? onOpen?.()
                : item.url && onPreview?.({ ...item, url: item.url })
            }
            className={`${compact ? "h-16 w-full sm:h-20 sm:w-28" : "h-14 w-full sm:w-20"} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]`}
          >
            {item.url ? (
              item.kind === "video" ? (
                <video
                  src={uploadUrl(item.url)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={uploadUrl(item.url)}
                  alt={item.label}
                  className="h-full w-full object-cover"
                />
              )
            ) : item.kind === "video" ? (
              <VideoIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            )}
          </button>
        ))}
      </div>
      <div className="order-last min-w-0 basis-full md:order-none md:flex-1">
        <button
          className="line-clamp-2 w-full text-left text-sm font-medium leading-6"
          onClick={onOpen}
        >
          {shot.prompt}
        </button>
        {!!shot.isStale && (
          <span className="text-xs text-amber-700">
            {t("storyboard.stale")}
          </span>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {!compact && (
            <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Clock className="h-3 w-3" />
              <input
                aria-label={t("shot.duration")}
                type="number"
                min={5}
                max={15}
                value={duration}
                onChange={(e) => {
                  const next = Math.min(
                    15,
                    Math.max(5, Number(e.target.value)),
                  );
                  setDuration(next);
                  saveDuration.schedule(next);
                }}
                onBlur={() => {
                  void saveDuration.flush();
                }}
                className="w-12 rounded border border-[var(--border-subtle)] px-1 text-center text-xs"
              />
              s
            </label>
          )}
          {compact && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              {shot.duration}s
            </span>
          )}
        </div>
        {!compact && (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>{t("shot.transition")}:</span>
              {(["transitionIn", "transitionOut"] as const).map((field) => (
                <select
                  key={field}
                  aria-label={field}
                  value={shot[field] || "cut"}
                  onChange={(e) => updateShot({ [field]: e.target.value })}
                  className="h-7 rounded border border-[var(--border-subtle)] bg-white px-2 text-xs"
                >
                  {transitions.map((value) => (
                    <option key={value} value={value}>
                      {t(`shot.trans_${value}`)}
                    </option>
                  ))}
                </select>
              ))}
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
            </div>
            {(shot.soundDesign || shot.musicCue) && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {shot.soundDesign && `${t("shot.sfx")}: ${shot.soundDesign} `}
                {shot.musicCue && `${t("shot.music")}: ${shot.musicCue}`}
              </p>
            )}
          </>
        )}
      </div>
      {!compact && (
        <button
          onClick={copy}
          title={t("shot.copyPrompt")}
          className="ml-auto p-1 text-[var(--text-muted)]"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
