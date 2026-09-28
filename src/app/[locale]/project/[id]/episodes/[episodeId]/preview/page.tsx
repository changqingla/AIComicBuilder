"use client";

import { requestGeneration } from "@/lib/generation/client";
import useSWR from "swr";
import { useDraft } from "@/hooks/use-draft";

import { Button } from "@/components/ui/button";
import {
  getFirstFrameUrl,
  getKeyframeVideoUrl,
  getReferenceVideoUrl,
  getSceneRefFrameUrl,
} from "@/lib/shot-assets";
import { cn } from "@/lib/utils";
import { uploadUrl } from "@/lib/utils/upload-url";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Play,
  Film,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/workspace/page-header";

export default function EpisodePreviewPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const t = useTranslations();
  const { episode, fetchEpisode } = useEpisodeEditorStore();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const versionId = searchParams.get("versionId");

  useEffect(() => {
    if (versionId && params?.id) {
      fetchEpisode(params.id, episodeId, versionId);
    }
  }, [versionId, params?.id, episodeId, fetchEpisode]);

  const [assembling, setAssembling] = useState(false);
  const [selectedShot, setSelectedShot] = useState(0);

  const finalVideoUrl = episode?.finalVideoUrl ?? null;
  const [showFinal, setShowFinal] = useDraft(!!finalVideoUrl);
  const generationMode = episode?.generationMode ?? "keyframe";

  // Which mode's videos to preview — default to the project's generationMode
  const hasKeyframeVideos =
    episode?.shots.some((s) => getKeyframeVideoUrl(s)) ?? false;
  const hasReferenceVideos =
    episode?.shots.some((s) => getReferenceVideoUrl(s)) ?? false;
  const hasBothModes = hasKeyframeVideos && hasReferenceVideos;

  const [previewMode, setPreviewMode] = useDraft<"keyframe" | "reference">(
    generationMode,
  );

  const { data: videoValid } = useSWR(
    finalVideoUrl ? uploadUrl(finalVideoUrl) : null,
    async (url: string) => (await fetch(url, { method: "HEAD" })).ok,
  );

  if (!episode) return null;

  const getVideoUrl = (shot: (typeof episode.shots)[0]) =>
    previewMode === "reference"
      ? getReferenceVideoUrl(shot)
      : getKeyframeVideoUrl(shot);

  const getThumbnail = (shot: (typeof episode.shots)[0]) =>
    previewMode === "reference"
      ? getSceneRefFrameUrl(shot)
      : getFirstFrameUrl(shot);

  const shotsWithVideo = episode.shots.filter((s) => getVideoUrl(s));
  const completedVideos = shotsWithVideo.length;
  const currentShot =
    shotsWithVideo[Math.min(selectedShot, shotsWithVideo.length - 1)];
  const hasValidVideo = finalVideoUrl && videoValid === true;
  const playingFinal = hasValidVideo && showFinal;
  const playerUrl = playingFinal
    ? finalVideoUrl
    : currentShot && getVideoUrl(currentShot);
  const loadingVersion = !!versionId && versionId !== episode.versionId;

  async function handleAssemble() {
    if (!episode || loadingVersion) return;
    setAssembling(true);
    try {
      const res = await requestGeneration(episode.projectId, {
        action: "video_assemble",
        payload: {
          versionId: episode.versionId ?? undefined,
          generationMode: previewMode,
        },
        episodeId: episodeId,
      });
      await res.json();
      setShowFinal(true);
    } catch (err) {
      console.error("Video assemble error:", err);
      toast.error(t("common.generationFailed"));
    }
    setAssembling(false);
    await fetchEpisode(
      episode.projectId,
      episodeId,
      episode.versionId ?? undefined,
    );
  }

  function handleDownload() {
    if (!hasValidVideo) return;
    const a = document.createElement("a");
    a.href = uploadUrl(finalVideoUrl!);
    a.download = `${episode!.title || "video"}-final.mp4`;
    a.click();
  }

  function handleModeSwitch(mode: "keyframe" | "reference") {
    setPreviewMode(mode);
    setShowFinal(false);
    setSelectedShot(0);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("project.preview")}
        description={t("workspace.previewHint")}
      >
        {hasValidVideo && (
          <Button onClick={handleDownload} size="sm" variant="outline">
            <Download className="size-4" />
            {t("project.downloadVideo")}
          </Button>
        )}
        <Button
          onClick={handleAssemble}
          disabled={assembling || loadingVersion || !completedVideos}
          size="sm"
        >
          {assembling ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Film className="size-4" />
          )}
          {assembling ? t("common.generating") : t("project.assembleVideo")}
        </Button>
      </PageHeader>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="workspace-panel min-w-0 overflow-hidden">
          <div className="editor-section-header">
            <div className="toolbar">
              <Button
                size="sm"
                variant={!playingFinal ? "secondary" : "ghost"}
                aria-pressed={!playingFinal}
                onClick={() => setShowFinal(false)}
              >
                {t("workspace.clips")}
              </Button>
              {hasValidVideo && (
                <Button
                  size="sm"
                  variant={playingFinal ? "secondary" : "ghost"}
                  aria-pressed={!!playingFinal}
                  onClick={() => setShowFinal(true)}
                >
                  {t("project.finalVideo")}
                </Button>
              )}
            </div>
            {hasBothModes && !playingFinal && (
              <select
                aria-label={t("workspace.clips")}
                value={previewMode}
                onChange={(event) =>
                  handleModeSwitch(
                    event.target.value as "keyframe" | "reference",
                  )
                }
                className="h-9 max-w-full rounded-md border border-input bg-white px-2 text-sm"
              >
                <option value="keyframe">
                  {t("project.generationModeKeyframe")}
                </option>
                <option value="reference">
                  {t("project.generationModeReference")}
                </option>
              </select>
            )}
          </div>
          {playerUrl ? (
            <video
              key={playerUrl}
              controls
              className="aspect-video max-h-[65vh] w-full bg-[#191c22]"
              src={uploadUrl(playerUrl)}
            />
          ) : (
            <div className="empty-state min-h-80">
              <Play className="size-8 text-muted-foreground" />
              <p>{t("workspace.noClips")}</p>
            </div>
          )}
          <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-3">
            <p className="text-sm text-muted-foreground">
              {playingFinal ? t("project.finalVideoHint") : currentShot?.prompt}
            </p>
            {!playingFinal && currentShot && (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("workspace.previousShot")}
                  disabled={selectedShot === 0}
                  onClick={() => setSelectedShot(Math.max(0, selectedShot - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm tabular-nums">
                  {selectedShot + 1} / {shotsWithVideo.length}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("workspace.nextShot")}
                  disabled={selectedShot >= shotsWithVideo.length - 1}
                  onClick={() =>
                    setSelectedShot(
                      Math.min(shotsWithVideo.length - 1, selectedShot + 1),
                    )
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </section>
        <section className="workspace-panel min-w-0 overflow-hidden">
          <div className="editor-section-header">
            <h2 className="section-heading">{t("workspace.clips")}</h2>
            <span className="text-xs text-muted-foreground">
              {t("project.shotsCompleted", {
                completed: completedVideos,
                total: episode.shots.length,
              })}
            </span>
          </div>
          <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {shotsWithVideo.map((shot, index) => {
              const thumbnail = getThumbnail(shot);
              return (
                <button
                  key={shot.id}
                  aria-pressed={!playingFinal && selectedShot === index}
                  onClick={() => {
                    setSelectedShot(index);
                    setShowFinal(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50",
                    !playingFinal && selectedShot === index && "bg-muted",
                  )}
                >
                  <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded border border-border bg-muted">
                    {thumbnail ? (
                      <img
                        src={uploadUrl(thumbnail)}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Play className="m-auto mt-4 size-4 text-muted-foreground" />
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-xs leading-5 text-white">
                      {String(shot.sequence).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm leading-6">
                      {shot.prompt}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {shot.duration}s
                    </p>
                  </div>
                </button>
              );
            })}
            {!shotsWithVideo.length && (
              <p className="p-5 text-sm leading-6 text-muted-foreground">
                {t("workspace.noClips")}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
