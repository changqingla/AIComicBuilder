"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clock, Copy, ImageIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { useDraft } from "@/hooks/use-draft";
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
  const [duration, setDuration] = useDraft(shot.duration);
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
  const progress = [
    !!shot.prompt,
    frames.some((f) => f.url),
    !!shot.videoPrompt,
    !!video,
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
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <button
        onClick={onOpen}
        aria-label={`Open editor ${shot.sequence}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 font-mono text-sm font-bold text-primary"
      >
        {shot.sequence}
      </button>
      <div className="flex gap-1.5">
        {media.map((item) => (
          <button
            key={item.label}
            aria-label={item.label}
            onClick={() =>
              compact
                ? onOpen?.()
                : item.url && onPreview?.({ ...item, url: item.url })
            }
            className={`${compact ? "h-8 w-11" : "h-12 w-16"} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[--border-subtle] bg-[--surface]`}
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
              <VideoIcon className="h-3.5 w-3.5 text-[--text-muted]" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 text-[--text-muted]" />
            )}
          </button>
        ))}
      </div>
      <div className="order-last min-w-0 basis-full md:order-none md:flex-1">
        <button
          className="block w-full truncate text-left text-sm"
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
            <label className="flex items-center gap-1 text-xs text-[--text-muted]">
              <Clock className="h-3 w-3" />
              <input
                aria-label={t("shot.duration")}
                type="number"
                min={5}
                max={15}
                value={duration}
                onChange={(e) =>
                  setDuration(Math.min(15, Math.max(5, Number(e.target.value))))
                }
                onBlur={() =>
                  duration !== shot.duration && updateShot({ duration })
                }
                className="w-12 rounded border border-[--border-subtle] px-1 text-center text-xs"
              />
              s
            </label>
          )}
          {progress.map((done, index) => (
            <span
              key={index}
              className={`h-1.5 w-1.5 rounded-full ${done ? "bg-emerald-400" : "bg-[--border-subtle]"}`}
            />
          ))}
        </div>
        {!compact && (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[--text-muted]">
              <span>{t("shot.transition")}:</span>
              {(["transitionIn", "transitionOut"] as const).map((field) => (
                <select
                  key={field}
                  aria-label={field}
                  value={shot[field] || "cut"}
                  onChange={(e) => updateShot({ [field]: e.target.value })}
                  className="h-7 rounded border border-[--border-subtle] bg-white px-2 text-xs"
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
              <p className="mt-1 text-xs text-[--text-muted]">
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
          className="ml-auto p-1 text-[--text-muted]"
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
