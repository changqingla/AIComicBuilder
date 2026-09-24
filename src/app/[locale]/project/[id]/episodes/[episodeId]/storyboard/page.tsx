"use client";
import { useBatchGeneration } from "@/hooks/use-batch-generation";
import type { EpisodeDetail } from "@/stores/episode-editor-store";
import { useParams } from "next/navigation";

import { AgentPicker } from "@/components/agent-picker";
import { CharactersInlinePanel } from "@/components/editor/characters-inline-panel";
import { GenerationModeTab } from "@/components/editor/generation-mode-tab";
import { InlineModelPicker } from "@/components/editor/model-selector";
import { ShotCard } from "@/components/editor/shot-card";
import { ShotDrawer } from "@/components/editor/shot-drawer";
import { ShotKanban } from "@/components/editor/shot-kanban";
import { VersionCompare } from "@/components/editor/version-compare";
import { VideoRatioPicker } from "@/components/editor/video-ratio-picker";
import { PromptEditButton } from "@/components/prompt-templates/prompt-edit-button";
import { Button } from "@/components/ui/button";
import { useModelGuard } from "@/hooks/use-model-guard";
import { apiFetch } from "@/lib/api-fetch";
import { getFirstFramePrompt,getFirstFrameUrl,getKeyframeVideoUrl,getLastFramePrompt,getLastFrameUrl,getReferenceAssets,getReferenceVideoUrl,getSceneRefFrameUrl,hasKeyframePair } from "@/lib/shot-assets";
import { useEpisodeEditorStore,} from "@/stores/episode-editor-store";
import { useEpisodeStore } from "@/stores/episode-store";
import { useModelStore } from "@/stores/model-store";
import {
ChevronDown,
Download,
Film,
GitCompare,
ImageIcon,
LayoutGrid,
List,
Loader2,
Play,
Plus,
RefreshCw,
Sparkles,
VideoIcon,
} from "lucide-react";
import { useLocale,useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect,useMemo,useRef,useState } from "react";
import { toast } from "sonner";

export default function EpisodeStoryboardPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { episode } = useEpisodeEditorStore();
  return episode ? <StoryboardEditor key={episode.id} episode={episode} /> : null;
}

function StoryboardEditor({ episode }: { episode: EpisodeDetail }) {
  const t = useTranslations();
  const locale = useLocale();
  const fetchEpisode = useEpisodeEditorStore((state) => state.fetchEpisode);
  const getModelConfig = useModelStore((s) => s.getModelConfig);
  const [generating, setGenerating] = useState(false);
  const [videoRatio, setVideoRatio] = useState("16:9");
  const versions = episode?.versions ?? [];
  const [_selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [openDrawerShotId, setOpenDrawerShotId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => typeof window !== "undefined" && localStorage.getItem(`storyboardView:${episode.projectId}`) === "kanban" ? "kanban" : "list");
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const versionDropdownRef = useRef<HTMLDivElement>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [generatingRefPrompts, setGeneratingRefPrompts] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { episodeId } = useParams<{ episodeId: string }>();
  const episodeStoreEpisodes = useEpisodeStore((s) => s.episodes);
  const fetchEpisodes = useEpisodeStore((s) => s.fetchEpisodes);

  useEffect(() => {
    if (episode?.projectId && episodeStoreEpisodes.length === 0) {
      fetchEpisodes(episode.projectId);
    }
  }, [episode?.projectId, episodeStoreEpisodes.length, fetchEpisodes]);


  function switchView(mode: "list" | "kanban") {
    setViewMode(mode);
    if (episode) localStorage.setItem(`storyboardView:${episode.projectId}`, mode);
  }

  const textGuard = useModelGuard("text");
  const imageGuard = useModelGuard("image");
  const videoGuard = useModelGuard("video");


  // Derived: if user's selection is valid keep it, otherwise fall back to latest
  const selectedVersionId = (_selectedVersionId && versions.some((v) => v.id === _selectedVersionId))
    ? _selectedVersionId
    : (versions[0]?.id ?? null);

  const sceneGroups = useMemo(() => {
    if (!episode) return { groups: [], ungrouped: [] };

    const groupMap = new Map<string, { sceneId: string; shots: typeof episode.shots }>();
    const ungrouped: typeof episode.shots = [];

    for (const shot of episode.shots) {
      if (shot.sceneId) {
        const existing = groupMap.get(shot.sceneId);
        if (existing) {
          existing.shots.push(shot);
        } else {
          groupMap.set(shot.sceneId, { sceneId: shot.sceneId, shots: [shot] });
        }
      } else {
        ungrouped.push(shot);
      }
    }

    return {
      groups: Array.from(groupMap.values()),
      ungrouped,
    };
  }, [episode?.shots]);



  const totalShots = episode.shots.length;
  const batch = useBatchGeneration({ projectId: episode.projectId, episodeId: episode.id, versionId: selectedVersionId, ratio: videoRatio, total: totalShots });
  const batchProgress = batch.progress;
  const lastFailedShots = batch.failedShotIds;
  const generatingFrames = batch.active?.action === "batch_frame_generate";
  const generatingVideos = batch.active?.action === "batch_video_generate" || batch.active?.action === "batch_reference_video";
  const generatingSceneFrames = batch.active?.action === "batch_scene_frame";
  const generatingRefImages = generatingSceneFrames;
  const generatingVideoPrompts = batch.active?.action === "batch_video_prompt";
  const sceneFramesOverwrite = generatingSceneFrames && !!batch.active?.overwrite;
  const generatingFramesOverwrite = generatingFrames && !!batch.active?.overwrite;
  const generatingVideosOverwrite = generatingVideos && !!batch.active?.overwrite;
  const shotsWithFrames = episode.shots.filter((s) => hasKeyframePair(s)).length;
  const generationMode = (episode.generationMode || "keyframe") as "keyframe" | "reference";
  const shotsWithVideo = episode.shots.filter((s) =>
    generationMode === "reference" ? getReferenceVideoUrl(s) : getKeyframeVideoUrl(s)
  ).length;
  const shotsWithVideoPrompts = episode.shots.filter((s) => s.videoPrompt).length;
  const shotsWithSceneFrames = episode.shots.filter((s) => getSceneRefFrameUrl(s)).length;
  const shotsWithFrameAny = episode.shots.filter(
    (s) => getSceneRefFrameUrl(s) || getFirstFrameUrl(s) || getLastFrameUrl(s)
  ).length;
  const charactersWithRefs = episode.characters.filter((c) => c.referenceImage);
  const hasReferenceImages = charactersWithRefs.length > 0;

  // Check if all reference images are generated (for reference mode blocking)
  const allRefImagesGenerated = useMemo(() => {
    if (generationMode !== "reference") return true;
    for (const shot of episode.shots) {
      const refOnly = getReferenceAssets(shot);
      if (refOnly.length === 0) continue;
      if (refOnly.some((r) => r.status !== "completed" && r.prompt)) {
        return false;
      }
    }
    return true;
  }, [episode.shots, generationMode]);

  const shotsWithRefPrompts = useMemo(() => {
    if (!episode) return 0;
    return episode.shots.filter((s) => {
      const refOnly = getReferenceAssets(s);
      return refOnly.length > 0 && refOnly.some((r) => r.prompt);
    }).length;
  }, [episode?.shots]);

  const shotsWithKeyframePrompts = useMemo(() => {
    if (!episode) return 0;
    return episode.shots.filter((s) => {
      const ff = getFirstFramePrompt(s);
      const lf = getLastFramePrompt(s);
      return !!ff && !!lf;
    }).length;
  }, [episode?.shots]);

  const shotsWithAllRefImages = useMemo(() => {
    if (!episode) return 0;
    return episode.shots.filter((s) => {
      const refOnly = getReferenceAssets(s);
      return refOnly.length > 0 && refOnly.every((r) => r.status === "completed" && r.fileUrl);
    }).length;
  }, [episode?.shots]);

  const anyGenerating = generating || generatingFrames || generatingVideos || generatingSceneFrames || generatingRefImages || generatingVideoPrompts || generatingRefPrompts;

  const drawerShots = episode.shots;

  async function handleDownload() {
    if (!episode || !episodeId) return;
    setDownloading(true);
    try {
      const query = new URLSearchParams({ episodeId: episodeId });
      if (selectedVersionId) query.set("versionId", selectedVersionId);
      const response = await apiFetch(`/api/projects/${episode.projectId}/download?${query}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${episode.title}-storyboard.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  }

  async function handleGenerateShots() {
    if (!episode) return;
    if (!textGuard("shot_split", episode.projectId)) return;
    setGenerating(true);

    try {
      const response = await apiFetch(`/api/projects/${episode.projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "shot_split",
          modelConfig: getModelConfig(),
          episodeId: episodeId,
        }),
      });

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
    } catch (err) {
      console.error("Shot split error:", err);
      toast.error(err instanceof Error ? err.message : t("common.generationFailed"));
    }

    setGenerating(false);
    await fetchEpisode(episode.projectId, episodeId!);
    setSelectedVersionId(null); // derived value will auto-select latest
  }

  async function handleBatchGenerateFrames(overwrite = false) {
    if (!imageGuard()) return false;
    return batch.run("batch_frame_generate", overwrite);
  }

  async function handleBatchGenerateVideos(overwrite = false) {
    if (!videoGuard()) return false;
    return batch.run("batch_video_generate", overwrite);
  }

  async function handleBatchGenerateSceneFrames(overwrite = false) {
    if (!imageGuard()) return false;
    return batch.run("batch_scene_frame", overwrite);
  }

  async function handleGenerateRefPrompts() {
    if (!episode) return;
    if (!textGuard("ref_image_prompts", episode.projectId)) return;
    setGeneratingRefPrompts(true);
    try {
      const resp = await apiFetch(`/api/projects/${episode.projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_ref_prompts",
          payload: { versionId: selectedVersionId },
          modelConfig: getModelConfig(),
          episodeId: episodeId,
        }),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      toast.success(`已生成 ${data.updatedCount}/${data.totalShots} 个镜头的参考图提示词`);
      await fetchEpisode(episode.projectId, episodeId, selectedVersionId || undefined);
    } catch (err) {
      toast.error("Failed to generate ref prompts");
      console.error(err);
    } finally {
      setGeneratingRefPrompts(false);
    }
  }

  // Synchronous batch generator for keyframe (first/last frame) image prompts.
  // Mirrors handleGenerateRefPrompts — single LLM call, returns immediately.
  const [generatingKeyframeAssets, setGeneratingKeyframeAssets] = useState(false);

  async function handleGenerateKeyframeAssets() {
    if (!episode) return;
    if (!textGuard("keyframe_prompts", episode.projectId)) return;
    setGeneratingKeyframeAssets(true);
    try {
      const resp = await apiFetch(`/api/projects/${episode.projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_keyframe_prompts",
          payload: { versionId: selectedVersionId },
          modelConfig: getModelConfig(),
          episodeId: episodeId,
        }),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      toast.success(`已生成 ${data.updatedCount}/${data.totalShots} 个镜头的首尾帧提示词`);
      await fetchEpisode(episode.projectId, episodeId, selectedVersionId || undefined);
    } catch (err) {
      toast.error("生成首尾帧提示词失败");
      console.error(err);
    } finally {
      setGeneratingKeyframeAssets(false);
    }
  }

  async function handleBatchGenerateRefImages(overwrite = false) {
    if (!imageGuard()) return false;
    return batch.run("batch_scene_frame", overwrite);
  }

  async function handleBatchGenerateVideoPrompts(overwrite = false) {
    
    return batch.run("batch_video_prompt", overwrite);
  }

  async function handleBatchGenerateReferenceVideos(overwrite = false) {
    if (!videoGuard()) return false;
    return batch.run("batch_reference_video", overwrite);
  }

  const handleRetryFailed = batch.retry;

  async function handleAutoRun() {
    if (!episode) return;
    if (!confirm(t("project.autoRunConfirm"))) return;

    const shots = episode.shots;
    const needsText = shots.some((s) => !s.prompt && !s.motionScript);
    const needsFrame = shots.some((s) =>
      generationMode === "reference" ? !getSceneRefFrameUrl(s) : !getFirstFrameUrl(s) || !getLastFrameUrl(s)
    );
    const needsPrompt = shots.some((s) => !s.videoPrompt);
    const needsVideo = shots.some((s) =>
      generationMode === "reference" ? !getReferenceVideoUrl(s) : !getKeyframeVideoUrl(s)
    );

    if (needsText) await handleGenerateShots();
    if (generationMode === "reference") {
      // Step 2a: Generate ref image prompts if needed
      const needsRefPrompts = shots.some((s) => getReferenceAssets(s).length === 0);
      if (needsRefPrompts) await handleGenerateRefPrompts();

      // Step 2b: Generate ref images
      if (needsFrame) await handleBatchGenerateSceneFrames(false);
    } else {
      if (needsFrame) await handleBatchGenerateFrames(false);
    }
    if (needsPrompt) await handleBatchGenerateVideoPrompts();
    if (needsVideo) {
      if (generationMode === "reference") await handleBatchGenerateReferenceVideos(false);
      else await handleBatchGenerateVideos(false);
    }
  }

  return (
    <div className="animate-page-in space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Film className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[--text-primary]">
              {t("project.storyboard")}
            </h2>
            <p className="text-xs text-[--text-muted]">
              {totalShots} shots
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PromptEditButton
            // Full set of storyboard-related prompts — matches the
            // settings/prompts page "分镜" tab exactly (9 prompts across
            // shot / frame / video categories). Both keyframe and
            // reference modes share the same list so the quick-access
            // drawer and the backend menu are 1:1 consistent.
            promptKeys={[
              // shot
              "shot_split",
              "shot_split_keyframe_assets",
              // frame
              "frame_generate_first",
              "frame_generate_last",
              "scene_frame_generate",
              "ref_image_prompts",
              // video
              "video_generate",
              "ref_video_generate",
              "ref_video_prompt",
            ]}
            projectId={episode.projectId}
          />
          {totalShots > 0 && (
            <div className="inline-flex gap-1 rounded-xl border border-[--border-subtle] bg-[--surface] p-1">
              <button
                onClick={() => switchView("list")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
                  viewMode === "list"
                    ? "bg-white text-primary shadow ring-1 ring-primary/20"
                    : "text-[--text-muted] hover:bg-white/60 hover:text-[--text-secondary]"
                }`}
              >
                <List className={`h-3.5 w-3.5 ${viewMode === "list" ? "text-primary" : ""}`} />
                {t("project.viewList")}
              </button>
              <button
                onClick={() => switchView("kanban")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
                  viewMode === "kanban"
                    ? "bg-white text-primary shadow ring-1 ring-primary/20"
                    : "text-[--text-muted] hover:bg-white/60 hover:text-[--text-secondary]"
                }`}
              >
                <LayoutGrid className={`h-3.5 w-3.5 ${viewMode === "kanban" ? "text-primary" : ""}`} />
                {t("project.viewKanban")}
              </button>
            </div>
          )}
          {totalShots > 0 && versions.length >= 2 && (
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              onClick={() => setCompareMode(!compareMode)}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {compareMode ? t("project.exitCompare") || "Exit Compare" : t("project.compareVersions") || "Compare Versions"}
            </Button>
          )}
          {totalShots > 0 && (
            <Link
              href={`/${locale}/project/${episode!.projectId}/episodes/${episodeId}/preview${selectedVersionId ? `?versionId=${selectedVersionId}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
            >
              <Film className="h-3.5 w-3.5" />
              {t("project.preview")}
            </Link>
          )}
          {totalShots > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {t("project.downloadAll")}
            </Button>
          )}
        </div>
      </div>

      {/* ── Control Panel ── */}
      <div className="rounded-2xl border border-[--border-subtle] bg-white p-4 space-y-3">
        {/* Generation mode + version tabs row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <GenerationModeTab />

          {/* Version tabs */}
          {versions.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {/* Show 2 newest versions */}
              {versions.slice(0, 2).map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVersionId(v.id);
                    fetchEpisode(episode!.projectId, episodeId, v.id);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    selectedVersionId === v.id
                      ? "bg-primary/10 text-primary"
                      : "text-[--text-muted] hover:bg-[--surface] hover:text-[--text-secondary]"
                  }`}
                >
                  {v.label}
                </button>
              ))}
              {/* Older versions dropdown */}
              {versions.length > 2 && (
                <div className="relative" ref={versionDropdownRef}>
                  <button
                    onClick={() => setVersionDropdownOpen((o) => !o)}
                    className={`flex items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                      versions.slice(2).some((v) => v.id === selectedVersionId)
                        ? "bg-primary/10 text-primary"
                        : "text-[--text-muted] hover:bg-[--surface] hover:text-[--text-secondary]"
                    }`}
                  >
                    {versions.slice(2).some((v) => v.id === selectedVersionId)
                      ? versions.find((v) => v.id === selectedVersionId)?.label
                      : `+${versions.length - 2}`}
                    <ChevronDown className={`h-3 w-3 transition-transform ${versionDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {versionDropdownOpen && (
                    <div
                      className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-[--border-subtle] bg-white shadow-lg"
                      onMouseLeave={() => setVersionDropdownOpen(false)}
                    >
                      {versions.slice(2).map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setSelectedVersionId(v.id);
                            fetchEpisode(episode!.projectId, episodeId, v.id);
                            setVersionDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-[--surface] ${
                            selectedVersionId === v.id ? "text-primary" : "text-[--text-secondary]"
                          }`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleGenerateShots}
                disabled={anyGenerating}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] text-[--text-muted] transition-colors hover:bg-[--surface] hover:text-[--text-secondary] disabled:opacity-40"
                title={t("project.generateShots")}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Characters inline panel (Feature B) */}
        <CharactersInlinePanel
          characters={episode.characters}
          projectId={episode.projectId}
          generationMode={generationMode}
          onUpdate={() => fetchEpisode(episode.projectId, episodeId, selectedVersionId ?? undefined)}
        />

        {/* Batch operations */}
        {viewMode === "list" && (
        <div className="space-y-2">
          {/* Row 1: Generate text / shots */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-[--surface] text-[10px] font-bold text-[--text-muted]">1</span>
            <AgentPicker projectId={episode.projectId} category="shot_split" />
            <InlineModelPicker capability="text" />
            <Button
              onClick={handleGenerateShots}
              disabled={anyGenerating}
              variant="default"
              size="sm"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generating ? t("common.generating") : t("project.generateShots")}
            </Button>
          </div>

          {/* Row 2: Frames */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-[--surface] text-[10px] font-bold text-[--text-muted]">2</span>
            <AgentPicker projectId={episode.projectId} category={generationMode === "reference" ? "ref_image_prompts" : "keyframe_prompts"} />
            <InlineModelPicker capability="image" />
            {generationMode === "reference" ? (
              <>
                <Button
                  size="sm"
                  onClick={handleGenerateRefPrompts}
                  disabled={generatingRefPrompts || anyGenerating || totalShots === 0}
                >
                  {generatingRefPrompts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {generatingRefPrompts ? t("common.generating") : (t("storyboard.generateRefPrompts") || "Generate Ref Prompts")}
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleBatchGenerateSceneFrames(false)}
                  disabled={anyGenerating || totalShots === 0 || shotsWithRefPrompts === 0}
                >
                  {generatingSceneFrames && !sceneFramesOverwrite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  {generatingSceneFrames && !sceneFramesOverwrite ? t("common.generating") : (t("storyboard.batchGenerateRefImages") || "Batch Generate Ref Images")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchGenerateSceneFrames(true)}
                  disabled={anyGenerating || totalShots === 0 || !hasReferenceImages}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={handleGenerateKeyframeAssets}
                  disabled={generatingKeyframeAssets || anyGenerating || totalShots === 0}
                  title="基于已有的镜头元数据生成首尾帧的图像提示词"
                >
                  {generatingKeyframeAssets ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {generatingKeyframeAssets ? "生成中…" : "生成首尾帧提示词"}
                </Button>
                <Button
                  onClick={() => handleBatchGenerateFrames(false)}
                  disabled={anyGenerating || totalShots === 0 || shotsWithKeyframePrompts === 0}
                  variant="default"
                  size="sm"
                >
                  {generatingFrames && !generatingFramesOverwrite ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  {generatingFrames && !generatingFramesOverwrite
                    ? t("common.generating")
                    : t("project.batchGenerateFrames")}
                </Button>
                <Button
                  onClick={() => handleBatchGenerateFrames(true)}
                  disabled={anyGenerating || totalShots === 0 || shotsWithKeyframePrompts === 0}
                  variant="ghost"
                  size="icon"
                  title={t("project.batchGenerateFramesOverwrite")}
                >
                  {generatingFrames && generatingFramesOverwrite ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Row 3: Video prompts */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-[--surface] text-[10px] font-bold text-[--text-muted]">3</span>
            <AgentPicker projectId={episode.projectId} category={generationMode === "reference" ? "ref_video_prompts" : "video_prompts"} />
            <InlineModelPicker capability="text" />
            <Button
              onClick={() => handleBatchGenerateVideoPrompts()}
              disabled={anyGenerating || shotsWithFrameAny === 0}
              variant="default"
              size="sm"
            >
              {generatingVideoPrompts ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generatingVideoPrompts ? t("common.generating") : t("project.batchGenerateVideoPrompts")}
            </Button>
          </div>

          {/* Row 4: Videos */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-[--surface] text-[10px] font-bold text-[--text-muted]">4</span>
            <InlineModelPicker capability="video" />
            <VideoRatioPicker value={videoRatio} onChange={setVideoRatio} />
            <Button
              onClick={() =>
                generationMode === "reference"
                  ? handleBatchGenerateReferenceVideos(false)
                  : handleBatchGenerateVideos(false)
              }
              disabled={
  anyGenerating ||
  totalShots === 0 ||
  shotsWithVideoPrompts !== totalShots ||
  (generationMode === "reference"
    ? !hasReferenceImages || !allRefImagesGenerated || shotsWithRefPrompts !== totalShots
    : shotsWithFrames !== totalShots)
}
              variant="default"
              size="sm"
            >
              {generatingVideos && !generatingVideosOverwrite ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <VideoIcon className="h-3.5 w-3.5" />
              )}
              {generatingVideos && !generatingVideosOverwrite
                ? t("common.generating")
                : generationMode === "reference"
                  ? t("project.batchGenerateReferenceVideos")
                  : t("project.batchGenerateVideos")}
            </Button>
            <Button
              onClick={() =>
                generationMode === "reference"
                  ? handleBatchGenerateReferenceVideos(true)
                  : handleBatchGenerateVideos(true)
              }
              disabled={
  anyGenerating ||
  totalShots === 0 ||
  shotsWithVideoPrompts !== totalShots ||
  (generationMode === "reference"
    ? !hasReferenceImages || !allRefImagesGenerated || shotsWithRefPrompts !== totalShots
    : shotsWithFrames !== totalShots)
}
              variant="ghost"
              size="icon"
              title={t("project.batchGenerateVideosOverwrite")}
            >
              {generatingVideos && generatingVideosOverwrite ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* Divider + Auto-run */}
          {totalShots > 0 && (
            <>
              <div className="h-px bg-[--border-subtle]" />
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAutoRun}
                  disabled={anyGenerating}
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                >
                  {anyGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {t("project.autoRun")}
                </Button>
                {lastFailedShots.length > 0 && !batchProgress && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryFailed}
                    disabled={anyGenerating}
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    <RefreshCw className="mr-1 h-4 w-4" />
                    Retry {lastFailedShots.length} failed
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Batch progress bar */}
          {batchProgress && (
            <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              <div className="flex-1">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${batchProgress.total > 0 ? (batchProgress.completed / batchProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-sm text-muted-foreground tabular-nums">
                {batchProgress.completed}/{batchProgress.total}
                {batchProgress.failed.length > 0 && (
                  <span className="text-destructive ml-1">
                    ({batchProgress.failed.length} failed)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Shot cards */}
      {compareMode ? (
        <VersionCompare
          versions={versions}
          currentVersionId={selectedVersionId}
          onVersionChange={setSelectedVersionId}
          getShotsForVersion={() => {
            // UI shell: returns current shots as placeholder for both versions
            // Full per-version fetching would require additional API calls
            return episode.shots.map((s) => ({
              id: s.id,
              sequence: s.sequence,
              firstFrame: getFirstFrameUrl(s),
              lastFrame: getLastFrameUrl(s),
              prompt: s.prompt,
              duration: s.duration,
            }));
          }}
        />
      ) : totalShots === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[--border-subtle] bg-[--surface]/50 py-24">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10">
            <Film className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-lg font-semibold text-[--text-primary]">
            {t("project.storyboard")}
          </h3>
          <p className="mt-2 max-w-sm text-center text-sm text-[--text-secondary]">
            {t("shot.noShots")}
          </p>
        </div>
      ) : viewMode === "kanban" ? (
        <ShotKanban
          shots={episode.shots}
          generationMode={generationMode}
          anyGenerating={anyGenerating}
          onOpenDrawer={(id) => setOpenDrawerShotId(id)}
          onBatchFrames={() => handleBatchGenerateFrames(false)}
          onBatchSceneFrames={() => handleBatchGenerateSceneFrames(false)}
          onBatchVideoPrompts={handleBatchGenerateVideoPrompts}
          onBatchVideos={() => handleBatchGenerateVideos(false)}
          onBatchReferenceVideos={() => handleBatchGenerateReferenceVideos(false)}
          generatingFrames={generatingFrames}
          generatingSceneFrames={generatingSceneFrames}
          generatingVideoPrompts={generatingVideoPrompts}
          generatingVideos={generatingVideos}
        />
      ) : (
        (() => {
          const renderShotCard = (shot: typeof episode.shots[number]) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              projectId={episode.projectId}
              onUpdate={() => fetchEpisode(episode.projectId, episodeId, selectedVersionId ?? undefined)}
              generationMode={generationMode}
              videoRatio={videoRatio}
              isCompact={openDrawerShotId !== null}
              onOpenDrawer={(id) => setOpenDrawerShotId(id)}
              batchGeneratingFrames={generationMode === "reference" ? generatingSceneFrames : generatingFrames}
              batchGeneratingVideoPrompts={generatingVideoPrompts}
              batchGeneratingVideos={generatingVideos}
            />
          );

          return sceneGroups.groups.length > 0 ? (
            <div className="space-y-6">
              {sceneGroups.groups.map((group, groupIndex) => (
                <div key={group.sceneId} className="space-y-3">
                  {/* Scene header */}
                  <div className="flex items-center gap-2 border-b pb-2 pt-4">
                    <Film className="h-4 w-4 text-[--text-muted]" />
                    <h3 className="text-sm font-medium">
                      Scene {groupIndex + 1}
                    </h3>
                    <span className="text-xs text-[--text-muted]">
                      {group.shots.length} {group.shots.length === 1 ? "shot" : "shots"}
                    </span>
                  </div>
                  {/* Shots in this scene */}
                  {group.shots.map((shot) => renderShotCard(shot))}
                </div>
              ))}

              {/* Ungrouped shots */}
              {sceneGroups.ungrouped.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b pb-2 pt-4">
                    <h3 className="text-sm font-medium text-[--text-muted]">Other Shots</h3>
                  </div>
                  {sceneGroups.ungrouped.map((shot) => renderShotCard(shot))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {episode.shots.map((shot) => renderShotCard(shot))}
            </div>
          );
        })()
      )}

      {openDrawerShotId && (
        <ShotDrawer
          key={openDrawerShotId}
          shots={drawerShots}
          openShotId={openDrawerShotId}
          onClose={() => setOpenDrawerShotId(null)}
          onShotChange={(id) => setOpenDrawerShotId(id)}
          onUpdate={() => fetchEpisode(episode.projectId, episodeId, selectedVersionId ?? undefined)}
          projectId={episode.projectId}
          generationMode={generationMode}
          videoRatio={videoRatio}
          selectedVersionId={selectedVersionId}
          anyGenerating={anyGenerating}
        />
      )}
    </div>
  );
}
