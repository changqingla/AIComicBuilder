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
import { PageHeader } from "@/components/workspace/page-header";
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
    <PageHeader
      title={t("project.storyboard")}
      description={`${t("workspace.storyboardHint")} ${t("workspace.shotCount", { count: episode.shots.length })}`}
    >
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
          <div className="inline-flex gap-1 rounded-md border border-border bg-muted p-1">
            {(["list", "kanban"] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={view === mode}
                onClick={() => onViewChange(mode)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view === mode ? "bg-white text-foreground shadow-sm" : "text-[var(--text-muted)]"}`}
              >
                {mode === "list" ? (
                  <List className="h-3.5 w-3.5" />
                ) : (
                  <LayoutGrid className="h-3.5 w-3.5" />
                )}
                {t(mode === "list" ? "project.viewList" : "project.viewKanban")}
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
            className="subtle-link"
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
    </PageHeader>
  );
}
