"use client";

import { ChevronLeft, ChevronRight, ImageIcon, VideoIcon } from "lucide-react";
import { getAssetHistoryForSlot, type ShotAsset } from "@/lib/shot-assets";
import type { Shot } from "@/lib/editor-types";
import { uploadUrl } from "@/lib/utils/upload-url";
import type { Media } from "./media-preview";

export function AssetMedia({
  shot,
  asset,
  label,
  onPreview,
  onActivate,
  disabled,
}: {
  shot: Shot;
  asset?: ShotAsset;
  label: string;
  onPreview: (media: Media) => void;
  onActivate: (id: string) => Promise<unknown>;
  disabled?: boolean;
}) {
  const video =
    asset?.type === "keyframe_video" || asset?.type === "reference_video";
  const history = asset
    ? getAssetHistoryForSlot(shot, asset.type, asset.sequenceInType)
        .filter((a) => a.fileUrl)
        .reverse()
    : [];
  const index = history.findIndex((a) => a.id === asset?.id);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-[--surface]">
      <button
        disabled={!asset?.fileUrl}
        aria-label={label}
        className="flex h-full w-full items-center justify-center"
        onClick={() =>
          asset?.fileUrl &&
          onPreview({
            url: asset.fileUrl,
            kind: video ? "video" : "image",
            label,
          })
        }
      >
        {asset?.fileUrl ? (
          video ? (
            <video
              src={uploadUrl(asset.fileUrl)}
              className="h-full w-full object-contain"
            />
          ) : (
            <img
              src={uploadUrl(asset.fileUrl)}
              alt={label}
              className="h-full w-full object-cover"
            />
          )
        ) : video ? (
          <VideoIcon className="h-5 w-5 text-[--text-muted]" />
        ) : (
          <ImageIcon className="h-5 w-5 text-[--text-muted]" />
        )}
      </button>
      {history.length > 1 && (
        <>
          <button
            disabled={disabled}
            aria-label={`${label}: previous version`}
            onClick={() =>
              onActivate(
                history[(index - 1 + history.length) % history.length].id,
              )
            }
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            disabled={disabled}
            aria-label={`${label}: next version`}
            onClick={() => onActivate(history[(index + 1) % history.length].id)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 text-xs text-white">
            {index + 1}/{history.length}
          </span>
        </>
      )}
    </div>
  );
}
