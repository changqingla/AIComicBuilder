"use client";

import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/utils/upload-url";
import { cn } from "@/lib/utils";
import type { Episode } from "@/stores/episode-store";
import { ArrowRight, Film, Pencil, Play, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

interface EpisodeCardProps {
  episode: Episode;
  projectId: string;
  onEdit: (episode: Episode) => void;
  onDelete: (episode: Episode) => void;
  onPlayVideo?: (episode: Episode) => void;
  selectionMode?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: (episode: Episode) => void;
}

export function EpisodeCard({
  episode,
  projectId,
  onEdit,
  onDelete,
  onPlayVideo,
  selectionMode,
  selected,
  selectable,
  onToggleSelect,
}: EpisodeCardProps) {
  const locale = useLocale();
  const t = useTranslations();
  const detailHref = `/${locale}/project/${projectId}/episodes/${episode.id}/script`;
  const image = episode.previewImages?.[0];
  const label = `EP.${String(episode.sequence).padStart(2, "0")}`;
  const thumbnail = (
    <div className="relative flex aspect-video h-full w-full items-center justify-center overflow-hidden bg-muted">
      {episode.finalVideoUrl ? (
        <video
          src={uploadUrl(episode.finalVideoUrl)}
          className="absolute inset-0 size-full object-cover"
          muted
          preload="metadata"
        />
      ) : image ? (
        <img
          src={uploadUrl(image)}
          alt={episode.title}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <Film className="size-8 text-slate-400" strokeWidth={1.2} />
      )}
      {episode.finalVideoUrl && (
        <span className="relative flex size-10 items-center justify-center rounded-full bg-white/95 text-foreground">
          <Play className="ml-0.5 size-4 fill-current" />
        </span>
      )}
    </div>
  );
  return (
    <article
      className={cn(
        "workspace-panel grid overflow-hidden sm:grid-cols-[208px_minmax(0,1fr)]",
        selected && "border-primary ring-1 ring-primary/20",
      )}
    >
      {episode.finalVideoUrl && !selectionMode ? (
        <button
          aria-label={`${t("project.preview")} ${episode.title}`}
          onClick={() => onPlayVideo?.(episode)}
        >
          {thumbnail}
        </button>
      ) : selectionMode ? (
        thumbnail
      ) : (
        <Link href={detailHref} tabIndex={-1} aria-hidden="true">
          {thumbnail}
        </Link>
      )}
      <div className="flex min-w-0 flex-col gap-3 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{label}</span>
              <span>
                {t(
                  `dashboard.projectStatus.${episode.status}` as "dashboard.projectStatus.draft",
                )}
              </span>
            </div>
            {selectionMode ? (
              <label className="flex items-center gap-3 text-base font-medium">
                <input
                  type="checkbox"
                  checked={!!selected}
                  disabled={!selectable}
                  onChange={() => onToggleSelect?.(episode)}
                  className="size-4"
                />
                {episode.title}
              </label>
            ) : (
              <Link
                href={detailHref}
                className="text-base font-semibold hover:text-primary"
              >
                {episode.title}
              </Link>
            )}
          </div>
          {!selectionMode && (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("episode.edit")} ${episode.title}`}
                title={t("episode.edit")}
                onClick={() => onEdit(episode)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("common.delete")} ${episode.title}`}
                title={t("common.delete")}
                onClick={() => onDelete(episode)}
                className="hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {episode.description || t("episode.noDescription")}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">
            {episode.keywords
              ?.split(/[,，]/)
              .map((word) => word.trim())
              .filter(Boolean)
              .join(" · ")}
          </span>
          {!selectionMode && (
            <Link
              href={detailHref}
              className="inline-flex shrink-0 items-center gap-2 py-1 text-sm font-medium text-foreground hover:text-primary"
            >
              {t("episode.edit")}
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
