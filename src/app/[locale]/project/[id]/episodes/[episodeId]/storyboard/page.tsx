"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Film } from "lucide-react";
import {
  useEpisodeEditorStore,
  type EpisodeDetail,
} from "@/stores/episode-editor-store";
import { useStoryboardGeneration } from "@/hooks/use-storyboard-generation";
import { CharactersInlinePanel } from "@/components/editor/characters-inline-panel";
import { GenerationModeTab } from "@/components/editor/generation-mode-tab";
import { ShotDrawer } from "@/components/editor/shot-drawer";
import { ShotKanban } from "@/components/editor/shot-kanban";
import { VersionCompare } from "@/components/editor/version-compare";
import { StoryboardHeader } from "@/components/editor/storyboard/header";
import { VersionPicker } from "@/components/editor/storyboard/version-picker";
import { GenerationControls } from "@/components/editor/storyboard/generation-controls";
import { ShotList } from "@/components/editor/storyboard/shot-list";

export default function EpisodeStoryboardPage() {
  const episode = useEpisodeEditorStore((s) => s.episode);
  return episode ? (
    <StoryboardEditor key={episode.id} episode={episode} />
  ) : null;
}

function StoryboardEditor({ episode }: { episode: EpisodeDetail }) {
  const t = useTranslations();
  const fetchEpisode = useEpisodeEditorStore((s) => s.fetchEpisode);
  const [selection, setSelection] = useState<string | null>(null);
  const [drawerShotId, setDrawerShotId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [ratio, setRatio] = useState("16:9");
  const [view, setView] = useState<"list" | "kanban">(() =>
    typeof window !== "undefined" &&
    localStorage.getItem(`storyboardView:${episode.projectId}`) === "kanban"
      ? "kanban"
      : "list",
  );
  const versionId = episode.versions.some((v) => v.id === selection)
    ? selection
    : (episode.versions[0]?.id ?? null);
  const activeVersion = useRef(versionId);
  useEffect(() => {
    activeVersion.current = versionId;
    return () => {
      activeVersion.current = null;
    };
  }, [versionId]);
  const mode = episode.generationMode;
  const workflow = useStoryboardGeneration(episode, versionId, ratio, (id) => {
    activeVersion.current = id;
    setSelection(id);
  });
  // A save may finish after the user selected a different version or left the page.
  const refresh = async () => {
    if (activeVersion.current === versionId) {
      await fetchEpisode(episode.projectId, episode.id, versionId ?? undefined);
    }
  };
  const editor = {
    projectId: episode.projectId,
    versionId,
    videoRatio: ratio,
    generationMode: mode,
    onUpdate: refresh,
    disabled: workflow.busy,
    batchGeneratingFrames: workflow.generating.frames,
    batchGeneratingVideoPrompts: workflow.generating.videoPrompts,
    batchGeneratingVideos: workflow.generating.videos,
  };
  function switchView(next: typeof view) {
    setView(next);
    localStorage.setItem(`storyboardView:${episode.projectId}`, next);
  }
  async function selectVersion(id: string) {
    setDrawerShotId(null);
    activeVersion.current = id;
    setSelection(id);
    await fetchEpisode(episode.projectId, episode.id, id);
  }
  return (
    <div className="animate-page-in space-y-4">
      <StoryboardHeader
        episode={episode}
        versionId={versionId}
        view={view}
        onViewChange={switchView}
        compare={compare}
        onCompareChange={setCompare}
      />
      <div className="space-y-3 rounded-2xl border border-[--border-subtle] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GenerationModeTab disabled={workflow.busy} />
          <VersionPicker
            versions={episode.versions}
            selected={versionId}
            onSelect={selectVersion}
            onCreate={workflow.generateShots}
            disabled={workflow.busy}
          />
        </div>
        <CharactersInlinePanel
          characters={episode.characters}
          projectId={episode.projectId}
          generationMode={mode}
          onUpdate={refresh}
        />
        {view === "list" && (
          <GenerationControls
            episode={episode}
            workflow={workflow}
            ratio={ratio}
            onRatioChange={setRatio}
          />
        )}
      </div>
      {compare ? (
        <VersionCompare
          versions={episode.versions}
          projectId={episode.projectId}
          episodeId={episode.id}
        />
      ) : !episode.shots.length ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-[--border-subtle] bg-[--surface]/50 py-24">
          <Film className="mb-5 h-8 w-8 text-primary" />
          <h3 className="text-lg font-semibold">{t("project.storyboard")}</h3>
          <p className="mt-2 text-sm text-[--text-secondary]">
            {t("shot.noShots")}
          </p>
        </div>
      ) : view === "kanban" ? (
        <ShotKanban
          shots={episode.shots}
          generationMode={mode}
          workflow={workflow}
          onOpenDrawer={setDrawerShotId}
        />
      ) : (
        <ShotList
          shots={episode.shots}
          {...editor}
          isCompact={drawerShotId !== null}
          onOpenDrawer={setDrawerShotId}
        />
      )}
      {drawerShotId && (
        <ShotDrawer
          shots={episode.shots}
          openShotId={drawerShotId}
          onClose={() => setDrawerShotId(null)}
          onShotChange={setDrawerShotId}
          {...editor}
        />
      )}
    </div>
  );
}
