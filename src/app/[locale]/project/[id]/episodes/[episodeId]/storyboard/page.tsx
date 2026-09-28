"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Film, SlidersHorizontal } from "lucide-react";
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
import {
  AutosaveProvider,
  useFlushAutosaves,
} from "@/components/editor/autosave-provider";

export default function EpisodeStoryboardPage() {
  const episode = useEpisodeEditorStore((s) => s.episode);
  return episode ? (
    <AutosaveProvider key={episode.id}>
      <StoryboardEditor episode={episode} />
    </AutosaveProvider>
  ) : null;
}

function StoryboardEditor({ episode }: { episode: EpisodeDetail }) {
  const t = useTranslations();
  const fetchEpisode = useEpisodeEditorStore((s) => s.fetchEpisode);
  const [switchingVersion, setSwitchingVersion] = useState(false);
  const flushAutosaves = useFlushAutosaves();
  const [drawerShotId, setDrawerShotId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [ratio, setRatio] = useState("16:9");
  const [view, setView] = useState<"list" | "kanban">(() =>
    typeof window !== "undefined" &&
    localStorage.getItem(`storyboardView:${episode.projectId}`) === "kanban"
      ? "kanban"
      : "list",
  );
  const versionId = episode.versionId;
  const activeVersion = useRef(versionId);
  useEffect(() => {
    activeVersion.current = versionId;
    return () => {
      activeVersion.current = null;
    };
  }, [versionId]);
  const mode = episode.generationMode;
  const workflow = useStoryboardGeneration(episode, versionId, ratio);
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
    disabled: workflow.busy || switchingVersion,
    batchGeneratingFrames: workflow.generating.frames,
    batchGeneratingVideoPrompts: workflow.generating.videoPrompts,
    batchGeneratingVideos: workflow.generating.videos,
  };
  function switchView(next: typeof view) {
    setView(next);
    localStorage.setItem(`storyboardView:${episode.projectId}`, next);
  }
  async function selectVersion(id: string) {
    setSwitchingVersion(true);
    try {
      if (!(await flushAutosaves())) return;
      setDrawerShotId(null);
      activeVersion.current = null;
      await fetchEpisode(episode.projectId, episode.id, id);
    } finally {
      activeVersion.current =
        useEpisodeEditorStore.getState().episode?.versionId ?? null;
      setSwitchingVersion(false);
    }
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
      <fieldset
        disabled={switchingVersion}
        className="workspace-panel space-y-4 p-4 sm:p-5"
      >
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
          <details
            open={!episode.shots.length}
            className="border-t border-border pt-3"
          >
            <summary className="text-sm font-medium text-muted-foreground">
              <SlidersHorizontal className="mr-2 inline size-4" />
              {t("workspace.generationSettings")}
              {workflow.busy && (
                <span role="status" className="ml-3 text-primary">
                  {t("common.generating")}
                </span>
              )}
            </summary>
            <div className="pt-4">
              <GenerationControls
                episode={episode}
                workflow={workflow}
                ratio={ratio}
                onRatioChange={setRatio}
              />
            </div>
          </details>
        )}
      </fieldset>
      {compare ? (
        <VersionCompare
          versions={episode.versions}
          projectId={episode.projectId}
          episodeId={episode.id}
        />
      ) : !episode.shots.length ? (
        <div className="empty-state">
          <Film className="mb-5 h-8 w-8 text-primary" />
          <h3 className="text-lg font-semibold">{t("project.storyboard")}</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
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
          isCompact
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
