"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  Download,
  Film,
  GitCompare,
  LayoutGrid,
  List,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PromptEditButton } from "@/components/prompt-templates/prompt-edit-button";
import { apiFetch } from "@/lib/api-fetch";
import type { EpisodeDetail } from "@/stores/episode-editor-store";

export function StoryboardHeader({
  episode,
  versionId,
  view,
  onViewChange,
  compare,
  onCompareChange,
}: {
  episode: EpisodeDetail;
  versionId: string | null;
  view: "list" | "kanban";
  onViewChange: (view: "list" | "kanban") => void;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [downloading, setDownloading] = useState(false);
  async function download() {
    setDownloading(true);
    try {
      const query = new URLSearchParams({ episodeId: episode.id });
      if (versionId) query.set("versionId", versionId);
      const response = await apiFetch(
        `/api/projects/${episode.projectId}/download?${query}`,
      );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${episode.title}-storyboard.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.downloadFailed"),
      );
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Film className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">
            {t("project.storyboard")}
          </h2>
          <p className="text-xs text-[--text-muted]">
            {episode.shots.length} shots
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PromptEditButton
          promptKeys={[
            "shot_split",
            "shot_split_keyframe_assets",
            "frame_generate_first",
            "frame_generate_last",
            "scene_frame_generate",
            "ref_image_prompts",
            "video_generate",
            "ref_video_generate",
            "ref_video_prompt",
          ]}
          projectId={episode.projectId}
        />
        {episode.shots.length > 0 && (
          <>
            <div className="inline-flex gap-1 rounded-xl border border-[--border-subtle] bg-[--surface] p-1">
              {(["list", "kanban"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onViewChange(mode)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view === mode ? "bg-white text-primary shadow ring-1 ring-primary/20" : "text-[--text-muted]"}`}
                >
                  {mode === "list" ? (
                    <List className="h-3.5 w-3.5" />
                  ) : (
                    <LayoutGrid className="h-3.5 w-3.5" />
                  )}
                  {t(
                    mode === "list" ? "project.viewList" : "project.viewKanban",
                  )}
                </button>
              ))}
            </div>
            {episode.versions.length >= 2 && (
              <Button
                size="sm"
                variant={compare ? "default" : "outline"}
                onClick={() => onCompareChange(!compare)}
              >
                <GitCompare className="h-3.5 w-3.5" />
                {t(compare ? "project.exitCompare" : "project.compareVersions")}
              </Button>
            )}
            <Link
              href={`/${locale}/project/${episode.projectId}/episodes/${episode.id}/preview${versionId ? `?versionId=${versionId}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent"
            >
              <Film className="h-3.5 w-3.5" />
              {t("project.preview")}
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={download}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {t("project.downloadAll")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
