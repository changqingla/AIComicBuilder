"use client";

import { EpisodeCard } from "@/components/editor/episode-card";
import { EpisodeDialog } from "@/components/editor/episode-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/workspace/page-header";
import { apiFetch } from "@/lib/api-fetch";
import { uploadUrl } from "@/lib/utils/upload-url";
import { useEpisodeStore, type Episode } from "@/stores/episode-store";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function EpisodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const locale = useLocale();
  const t = useTranslations("episode");
  const tc = useTranslations("common");
  const {
    episodes,
    loading,
    fetchEpisodes,
    createEpisode,
    deleteEpisode,
    updateEpisode,
  } = useEpisodeStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<Episode | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchEpisodes(projectId);
  }, [projectId, fetchEpisodes]);

  async function handleCreate(data: {
    title: string;
    description?: string;
    keywords?: string;
  }) {
    await createEpisode(projectId, data);
    toast.success(t("created"));
  }

  async function handleEdit(data: {
    title: string;
    description?: string;
    keywords?: string;
  }) {
    if (!editingEpisode) return;
    await updateEpisode(projectId, editingEpisode.id, data);
    setEditingEpisode(null);
  }

  async function handleDelete(episode: Episode) {
    if (episodes.length <= 1) {
      toast.error(t("cannotDeleteLast"));
      return;
    }
    if (!confirm(t("deleteConfirm"))) return;
    await deleteEpisode(projectId, episode.id);
  }

  const handlePlayVideo = useCallback((episode: Episode) => {
    setPlayingEpisode(episode);
  }, []);

  function toggleSelect(episode: Episode) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(episode.id)) next.delete(episode.id);
      else next.add(episode.id);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function handleMerge() {
    if (selectedIds.size < 2) {
      toast.error(t("mergeMinTwo"));
      return;
    }
    setMerging(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/merge-episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeIds: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Merge failed");
      }
      const data = await res.json();
      setMergedVideoUrl(data.videoUrl);
      toast.success(t("mergeSuccess"));
      exitSelectionMode();
    } catch (err) {
      console.error("Merge error:", err);
      toast.error(err instanceof Error ? err.message : t("mergeError"));
    } finally {
      setMerging(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-[var(--text-muted)]">{tc("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <PageHeader title={t("title")}>
        <Button
          variant="outline"
          onClick={() =>
            selectionMode ? exitSelectionMode() : setSelectionMode(true)
          }
          disabled={episodes.filter((e) => e.finalVideoUrl).length < 2}
        >
          {selectionMode ? t("mergeCancel") : t("mergeVideos")}
        </Button>
        <Link
          href={`/${locale}/project/${projectId}/import`}
          className="subtle-link"
        >
          {t("uploadScript")}
        </Link>
        <Button onClick={() => setCreateOpen(true)}>{t("create")}</Button>
      </PageHeader>

      {/* Episode grid */}
      {episodes.length === 0 ? (
        <div className="empty-state">
          <div className="mb-2 text-muted-foreground"></div>
          <h3 className="font-sans text-lg font-semibold text-[var(--text-primary)]">
            {t("title")}
          </h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t("noEpisodes")}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => setCreateOpen(true)} className="rounded-xl">
              {t("create")}
            </Button>
            <Link href={`/${locale}/project/${projectId}/import`}>
              <Button variant="outline" className="rounded-xl">
                {t("uploadScript")}
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="border-t border-border">
          {episodes.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              projectId={projectId}
              onEdit={(ep) => setEditingEpisode(ep)}
              onDelete={handleDelete}
              onPlayVideo={handlePlayVideo}
              selectionMode={selectionMode}
              selected={selectedIds.has(episode.id)}
              selectable={!!episode.finalVideoUrl}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Floating selection action bar */}
      {selectionMode && (
        <div className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-white px-5 py-3 shadow-xl">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {t("mergeSelected", { count: selectedIds.size })}
          </span>
          <Button variant="outline" size="sm" onClick={exitSelectionMode}>
            {t("mergeCancel")}
          </Button>
          <Button
            size="sm"
            disabled={selectedIds.size < 2 || merging}
            onClick={handleMerge}
          >
            {merging ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("merging")}
              </>
            ) : (
              t("mergeConfirm")
            )}
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <EpisodeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        mode="create"
      />

      {/* Edit dialog */}
      <EpisodeDialog
        open={!!editingEpisode}
        onOpenChange={(open) => {
          if (!open) setEditingEpisode(null);
        }}
        onSubmit={handleEdit}
        defaultValues={
          editingEpisode
            ? {
                title: editingEpisode.title,
                description: editingEpisode.description || "",
                keywords: editingEpisode.keywords || "",
              }
            : undefined
        }
        mode="edit"
      />

      <Dialog
        open={!!playingEpisode?.finalVideoUrl || !!mergedVideoUrl}
        onOpenChange={(open) => {
          if (!open) {
            setPlayingEpisode(null);
            setMergedVideoUrl(null);
          }
        }}
      >
        <DialogContent className="p-0 sm:max-w-4xl">
          <DialogHeader className="px-5 pt-5 pr-14">
            <DialogTitle>
              {playingEpisode?.title ?? t("mergeVideos")}
            </DialogTitle>
          </DialogHeader>
          {(playingEpisode?.finalVideoUrl || mergedVideoUrl) && (
            <video
              src={uploadUrl(
                (playingEpisode?.finalVideoUrl || mergedVideoUrl)!,
              )}
              controls
              autoPlay
              className="max-h-[70dvh] w-full bg-black"
            />
          )}
          {mergedVideoUrl && (
            <div className="flex justify-end px-5 pb-5">
              <a
                href={uploadUrl(mergedVideoUrl)}
                download
                className="subtle-link"
              >
                {t("downloadVideo")}
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
