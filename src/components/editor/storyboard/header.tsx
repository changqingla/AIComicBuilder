"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { PromptEditButton } from "@/components/prompt-templates/prompt-edit-button";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/page-header";
import { apiFetch } from "@/lib/api-fetch";
import type { EpisodeDetail } from "@/stores/episode-editor-store";
import { toast } from "sonner";

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
    <PageHeader title={t("project.storyboard")}>
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
          <div className="inline-flex gap-4 px-2">
            {(["list", "kanban"] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={view === mode}
                onClick={() => onViewChange(mode)}
                className={`border-b py-1 text-sm ${view === mode ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
              >
                {t(mode === "list" ? "project.viewList" : "project.viewKanban")}
              </button>
            ))}
          </div>
          {episode.versions.length >= 2 && (
            <Button
              size="sm"
              variant={compare ? "secondary" : "ghost"}
              onClick={() => onCompareChange(!compare)}
            >
              {t(compare ? "project.exitCompare" : "project.compareVersions")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={download}
            disabled={downloading}
          >
            {t("project.downloadAll")}
          </Button>
        </>
      )}
    </PageHeader>
  );
}
