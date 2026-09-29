"use client";

import { useEffect, use } from "react";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";

import { ProjectNav } from "@/components/editor/project-nav";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function EpisodeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string; episodeId: string }>;
}) {
  const { id, episodeId } = use(params);
  const t = useTranslations("common");
  const { episode, loading, error, openEpisode } = useEpisodeEditorStore();

  useEffect(() => {
    openEpisode(id, episodeId);
  }, [id, episodeId, openEpisode]);

  if (error)
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>{error}</p>
        <button
          onClick={() => openEpisode(id, episodeId)}
          className="text-primary underline"
        >
          {t("retry")}
        </button>
      </div>
    );

  if (loading || !episode || episode.id !== episodeId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="ml-2 text-sm text-[var(--text-muted)]">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ProjectNav
        projectId={id}
        episodeId={episodeId}
        episodeTitle={episode.title}
      />
      <div className="workspace-page">
        <div key={episodeId} className="min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
