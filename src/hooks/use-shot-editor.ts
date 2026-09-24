"use client";
import { useDraft } from "@/hooks/use-draft";
import { useModelGuard } from "@/hooks/use-model-guard";
import { apiFetch } from "@/lib/api-fetch";
import { type Shot } from "@/lib/editor-types";
import { id as genId } from "@/lib/id";
import {
  getFirstFramePrompt,
  getFirstFrameUrl,
  getKeyframeVideoUrl,
  getLastFramePrompt,
  getLastFrameUrl,
  getReferenceVideoUrl,
  getSceneRefFrameUrl,
  type ShotAsset,
} from "@/lib/shot-assets";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";
import { useModelStore } from "@/stores/model-store";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
export interface ShotCardProps {
  shot: Shot;
  projectId: string;
  onUpdate: () => void;
  generationMode?: "keyframe" | "reference";
  videoRatio?: string;
  isCompact?: boolean;
  onOpenDrawer?: (id: string) => void;
  batchGeneratingFrames?: boolean;
  batchGeneratingVideoPrompts?: boolean;
  batchGeneratingVideos?: boolean;
}
type StepState = "done" | "generating" | "error" | "idle";
export function useShotEditor({
  shot,
  projectId,
  onUpdate,
  generationMode = "keyframe",
  videoRatio = "16:9",
  isCompact = false,
  onOpenDrawer,
  batchGeneratingFrames = false,
  batchGeneratingVideoPrompts = false,
  batchGeneratingVideos = false,
}: ShotCardProps) {
  const id = shot.id;
  const sequence = shot.sequence;
  const prompt = shot.prompt;
  const videoScript = shot.videoScript;
  const motionScript = shot.motionScript;
  const cameraDirection = shot.cameraDirection;
  const duration = shot.duration;
  const videoPrompt = shot.videoPrompt;
  const transitionIn = shot.transitionIn;
  const transitionOut = shot.transitionOut;
  const compositionGuide = shot.compositionGuide;
  const focalPoint = shot.focalPoint;
  const depthOfField = shot.depthOfField;
  const soundDesign = shot.soundDesign;
  const musicCue = shot.musicCue;
  const isStale = shot.isStale;
  const dialogues = shot.dialogues ?? [];
  const firstFrame = getFirstFrameUrl(shot);
  const lastFrame = getLastFrameUrl(shot);
  const sceneRefFrame = getSceneRefFrameUrl(shot);
  const videoUrl =
    generationMode === "reference"
      ? getReferenceVideoUrl(shot)
      : getKeyframeVideoUrl(shot);
  const startFrameDesc = getFirstFramePrompt(shot);
  const endFrameDesc = getLastFramePrompt(shot);
  const status =
    generationMode === "reference"
      ? shot.status === "generating"
        ? "generating"
        : videoUrl
          ? "completed"
          : "pending"
      : shot.status;
  const t = useTranslations();
  const getModelConfig = useModelStore((s) => s.getModelConfig);

  // Edit state
  const [editPrompt, setEditPrompt] = useDraft(prompt);
  const [editStartFrame, setEditStartFrame] = useDraft(startFrameDesc ?? "");
  const [editEndFrame, setEditEndFrame] = useDraft(endFrameDesc ?? "");
  const [editMotionScript, setEditMotionScript] = useDraft(motionScript ?? "");
  const [editVideoPrompt, setEditVideoPrompt] = useDraft(videoPrompt ?? "");
  const [editCameraDirection, setEditCameraDirection] = useDraft(
    cameraDirection ?? "static",
  );
  const [editDuration, setEditDuration] = useDraft(duration);

  // Generation state
  const [generatingFrames, setGeneratingFrames] = useState(false);
  const [generatingSceneFrame, setGeneratingSceneFrame] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [rewritingText, setRewritingText] = useState(false);

  // Project characters (reactive)
  const projectCharacters = useEpisodeEditorStore(
    (s) => s.episode?.characters || [],
  );

  // UI state
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadFieldRef = useRef<string | null>(null);

  const imageGuard = useModelGuard("image");
  const videoGuard = useModelGuard("video");

  const allRefItems = useMemo(
    () => shot.assets.filter((asset) => asset.isActive === 1),
    [shot.assets],
  );
  function assetHistory(asset: ShotAsset) {
    return shot.assets
      .filter(
        (row) =>
          row.type === asset.type &&
          row.sequenceInType === asset.sequenceInType &&
          row.fileUrl,
      )
      .sort((a, b) => a.assetVersion - b.assetVersion);
  }
  function historyIds(asset: ShotAsset) {
    return assetHistory(asset).map((row) => row.id);
  }
  function modelRef(asset?: ShotAsset) {
    return asset?.modelProvider && asset.modelId
      ? { providerId: asset.modelProvider, modelId: asset.modelId }
      : null;
  }
  function newAsset(type: ShotAsset["type"], prompt = ""): ShotAsset {
    return {
      id: genId(),
      shotId: id,
      type,
      prompt,
      characters: null,
      fileUrl: null,
      assetVersion: 1,
      isActive: 1,
      status: "pending",
      sequenceInType:
        type === "reference"
          ? Math.max(
              -1,
              ...shot.assets
                .filter((a) => a.type === type)
                .map((a) => a.sequenceInType),
            ) + 1
          : 0,
    };
  }
  const parsedRefImages = useMemo(
    () => allRefItems.filter((r) => r.type === "reference"),
    [allRefItems],
  );
  const firstFrameItem = useMemo(
    () => allRefItems.find((r) => r.type === "first_frame"),
    [allRefItems],
  );
  const lastFrameItem = useMemo(
    () => allRefItems.find((r) => r.type === "last_frame"),
    [allRefItems],
  );

  // Derived state
  const hasText = !!(prompt || startFrameDesc || motionScript);
  const hasFrame = !!(sceneRefFrame || firstFrame || lastFrame);
  const hasFramePair = !!(firstFrame && lastFrame);
  const hasVideoPrompt = !!videoPrompt;
  const hasVideo = !!videoUrl;
  const hasRefImages = parsedRefImages.some(
    (r) => r.status === "completed" && r.fileUrl,
  );
  const isGenerating = status === "generating";

  // Step states
  const textState: StepState = rewritingText
    ? "generating"
    : hasText
      ? "done"
      : "idle";
  const frameState: StepState =
    generatingFrames || generatingSceneFrame || batchGeneratingFrames
      ? "generating"
      : status === "failed" && !hasFrame
        ? "error"
        : hasFrame
          ? "done"
          : "idle";
  const promptState: StepState =
    generatingPrompt || batchGeneratingVideoPrompts
      ? "generating"
      : hasVideoPrompt
        ? "done"
        : "idle";
  const videoState: StepState =
    generatingVideo || batchGeneratingVideos || (isGenerating && !hasVideo)
      ? "generating"
      : status === "failed" && !hasVideo
        ? "error"
        : hasVideo
          ? "done"
          : "idle";

  // Which step is "next"
  const nextStep = !hasFrame
    ? "frame"
    : !hasVideoPrompt
      ? "prompt"
      : !hasVideo
        ? "video"
        : null;

  async function patchShot(fields: Record<string, unknown>) {
    await apiFetch(`/api/projects/${projectId}/shots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  async function handleGenerateFrames() {
    if (!imageGuard()) return;
    setGeneratingFrames(true);
    try {
      await apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "single_frame_generate",
          payload: { shotId: id, ratio: videoRatio },
          modelConfig: getModelConfig(),
        }),
      });
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("common.generationFailed"),
      );
    }
    setGeneratingFrames(false);
  }

  async function handleGenerateVideoPrompt() {
    setGeneratingPrompt(true);
    try {
      await apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "single_video_prompt",
          payload: { shotId: id },
          modelConfig: getModelConfig(),
        }),
      });
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("common.generationFailed"),
      );
    }
    setGeneratingPrompt(false);
  }

  async function handleGenerateVideo() {
    if (!videoGuard()) return;
    setGeneratingVideo(true);
    try {
      await apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:
            generationMode === "reference"
              ? "single_reference_video"
              : "single_video_generate",
          payload: { shotId: id, ratio: videoRatio },
          modelConfig: getModelConfig(),
        }),
      });
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("common.generationFailed"),
      );
    }
    setGeneratingVideo(false);
  }

  async function handleRewriteText() {
    setRewritingText(true);
    try {
      await apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "single_shot_rewrite",
          payload: { shotId: id },
          modelConfig: getModelConfig(),
        }),
      });
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("common.generationFailed"),
      );
    }
    setRewritingText(false);
  }

  async function saveAssets(type: ShotAsset["type"], items: ShotAsset[]) {
    try {
      const previous = allRefItems.filter((asset) => asset.type === type);
      const sameItems =
        previous.length === items.length &&
        items.every((asset) => previous.some((row) => row.id === asset.id));
      if (sameItems) {
        for (const asset of items) {
          const saved = previous.find((row) => row.id === asset.id)!;
          const changes = Object.fromEntries(
            (["prompt", "characters", "modelProvider", "modelId"] as const)
              .filter(
                (key) =>
                  JSON.stringify(asset[key]) !== JSON.stringify(saved[key]),
              )
              .map((key) => [key, asset[key] ?? null]),
          );
          if (Object.keys(changes).length) await patchAsset(asset.id, changes);
        }
      } else {
        await apiFetch(`/api/projects/${projectId}/shots/${id}/assets`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, items }),
        });
      }
      onUpdate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save assets",
      );
    }
  }

  async function handleClearFrame(
    type: "first_frame" | "last_frame" | "reference",
  ) {
    await saveAssets(type, []);
  }

  async function saveRefImages(items: ShotAsset[]) {
    await saveAssets("reference", items);
  }

  /**
   * Activate a specific historical version of an asset (by shot_assets row ID).
   * The backend flips is_active flags and the next fetchProject pulls the new
   * active row.
   */
  async function activateAssetById(assetId: string) {
    try {
      const resp = await apiFetch(
        `/api/projects/${projectId}/shots/${id}/assets/${assetId}/activate`,
        { method: "POST" },
      );
      if (!resp.ok) throw new Error(await resp.text());
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to switch version",
      );
    }
  }

  /**
   * Save the prompt text for first_frame or last_frame.
   * If the asset row doesn't exist yet, create it via the sync endpoint.
   */
  async function saveKeyframePrompt(
    type: "first_frame" | "last_frame",
    prompt: string,
  ) {
    const existing = allRefItems.find((asset) => asset.type === type);
    await saveAssets(type, [
      existing ? { ...existing, prompt } : newAsset(type, prompt),
    ]);
  }

  function handleAddRefImage() {
    saveRefImages([...parsedRefImages, newAsset("reference")]);
  }

  // Remove a ref image
  function handleRemoveRefImage(refId: string) {
    const updated = parsedRefImages.filter((r) => r.id !== refId);
    saveRefImages(updated);
  }

  async function patchAsset(assetId: string, changes: Record<string, unknown>) {
    await apiFetch(`/api/projects/${projectId}/shots/${id}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
      keepalive: true,
    });
  }
  const saveFirstLater = useDebouncedCallback(
    (prompt: string) => saveKeyframePrompt("first_frame", prompt),
    500,
  );
  const saveLastLater = useDebouncedCallback(
    (prompt: string) => saveKeyframePrompt("last_frame", prompt),
    500,
  );
  const saveRefLater = useDebouncedCallback(
    async (assetId: string, prompt: string) => {
      try {
        await patchAsset(assetId, { prompt });
        onUpdate();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save prompt",
        );
      }
    },
    500,
  );
  useEffect(() => {
    const flush = () => {
      saveFirstLater.flush();
      saveLastLater.flush();
      saveRefLater.flush();
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [saveFirstLater, saveLastLater, saveRefLater]);

  function scheduleKeyframeSave(
    type: "first_frame" | "last_frame",
    prompt: string,
  ) {
    (type === "first_frame" ? saveFirstLater : saveLastLater)(prompt);
  }
  const [localRefPrompts, setLocalRefPrompts] = useState<
    Record<string, string>
  >({});
  function getRefPromptValue(assetId: string, prompt: string) {
    return localRefPrompts[assetId] ?? prompt;
  }
  function handleRefPromptChange(assetId: string, prompt: string) {
    setLocalRefPrompts((previous) => ({ ...previous, [assetId]: prompt }));
    saveRefLater(assetId, prompt);
  }

  // Switch active version of a ref image — calls the backend activate endpoint
  // by id, then re-fetches. Ref id is the *currently active* asset row id.
  async function handleSwitchRefImageVersion(
    refId: string,
    direction: "prev" | "next",
  ) {
    const ref = parsedRefImages.find((r) => r.id === refId);
    if (!ref || !historyIds(ref) || historyIds(ref).length < 2) return;
    const currentIdx = historyIds(ref).indexOf(refId);
    if (currentIdx < 0) return;
    const nextIdx =
      direction === "next"
        ? (currentIdx + 1) % historyIds(ref).length
        : (currentIdx - 1 + historyIds(ref).length) % historyIds(ref).length;
    const targetId = historyIds(ref)[nextIdx];
    await activateAssetById(targetId);
  }

  // Update a ref image's prompt (immediate save, e.g. on blur)
  function handleUpdateRefPrompt(assetId: string, prompt: string) {
    saveRefLater(assetId, prompt);
    saveRefLater.flush();
  }

  // Per-ref-image loading state
  const [regeneratingRefIds, setRegeneratingRefIds] = useState<Set<string>>(
    new Set(),
  );

  // Resolve a model ref to a full provider config (for per-card model override)
  function resolvePerCardImageRef(
    modelRef?: { providerId: string; modelId: string } | null,
  ) {
    if (!modelRef) return null;
    const providers = useModelStore.getState().providers;
    const provider = providers.find((p) => p.id === modelRef.providerId);
    if (!provider) return null;
    return {
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      secretKey: provider.secretKey,
      modelId: modelRef.modelId,
    };
  }

  // Regenerate a single ref image
  async function handleRegenerateRefImage(refId: string) {
    if (!imageGuard()) return;

    // Mark as loading
    setRegeneratingRefIds((prev) => new Set(prev).add(refId));

    try {
      // Get per-card model (if set) or fall back to global
      const ref = parsedRefImages.find((r) => r.id === refId);
      const baseConfig = getModelConfig();
      const perCardImage = resolvePerCardImageRef(modelRef(ref));
      const modelConfig = perCardImage
        ? { ...baseConfig, image: perCardImage }
        : baseConfig;

      const resp = await apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "single_ref_image_generate",
          payload: { shotId: id, refImageId: refId, ratio: videoRatio },
          modelConfig,
        }),
      });
      if (!resp.ok) throw new Error("Failed");
      onUpdate();
    } catch {
      toast.error(t("common.generationFailed"));
    } finally {
      setRegeneratingRefIds((prev) => {
        const next = new Set(prev);
        next.delete(refId);
        return next;
      });
    }
  }

  async function handleBatchGenerateRefImagesForShot() {
    if (!imageGuard()) return;
    setGeneratingSceneFrame(true);
    try {
      const resp = await apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "single_ref_image_generate_all",
          payload: { shotId: id, ratio: videoRatio },
          modelConfig: getModelConfig(),
        }),
      });
      if (!resp.ok) throw new Error("Failed");
      onUpdate();
      toast.success(t("common.generationCompleted"));
    } catch {
      toast.error(t("common.generationFailed"));
    }
    setGeneratingSceneFrame(false);
  }

  function handleUploadFrame(
    field: "first_frame" | "last_frame" | "reference",
  ) {
    uploadFieldRef.current = field;
    uploadInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const field = uploadFieldRef.current;
    if (!file || !field) return;
    e.target.value = "";
    setUploadingField(field);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("type", field);
      form.append("sequenceInType", "0");
      const res = await apiFetch(
        `/api/projects/${projectId}/shots/${id}/upload`,
        {
          method: "POST",
          body: form,
        },
      );
      if (!res.ok) throw new Error("Upload failed");
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("common.generationFailed"),
      );
    }
    setUploadingField(null);
  }

  function handleCopyPrompt() {
    const text =
      videoPrompt ||
      `${videoScript || motionScript || prompt}\nCamera: ${cameraDirection}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const frameAssets =
    generationMode === "reference"
      ? [
          {
            src: sceneRefFrame,
            label: t("shot.sceneRefFrame"),
            type: "image" as const,
          },
        ]
      : [
          {
            src: firstFrame,
            label: t("shot.firstFrame"),
            type: "image" as const,
          },
          {
            src: lastFrame,
            label: t("shot.lastFrame"),
            type: "image" as const,
          },
        ];

  // Progress dots: how many steps done out of 4

  return {
    projectId,
    onUpdate,
    generationMode,
    isCompact,
    onOpenDrawer,
    batchGeneratingFrames,
    batchGeneratingVideoPrompts,
    batchGeneratingVideos,
    id,
    sequence,
    prompt,
    motionScript,
    cameraDirection,
    duration,
    videoPrompt,
    transitionIn,
    transitionOut,
    compositionGuide,
    focalPoint,
    depthOfField,
    soundDesign,
    musicCue,
    isStale,
    dialogues,
    firstFrame,
    lastFrame,
    sceneRefFrame,
    videoUrl,
    t,
    editPrompt,
    setEditPrompt,
    editStartFrame,
    setEditStartFrame,
    editEndFrame,
    setEditEndFrame,
    editMotionScript,
    setEditMotionScript,
    editVideoPrompt,
    setEditVideoPrompt,
    editCameraDirection,
    setEditCameraDirection,
    editDuration,
    setEditDuration,
    generatingFrames,
    generatingSceneFrame,
    generatingVideo,
    generatingPrompt,
    rewritingText,
    projectCharacters,
    previewSrc,
    setPreviewSrc,
    copied,
    uploadingField,
    uploadInputRef,
    allRefItems,
    assetHistory,
    historyIds,
    modelRef,
    parsedRefImages,
    firstFrameItem,
    lastFrameItem,
    hasText,
    hasFrame,
    hasFramePair,
    hasVideoPrompt,
    hasVideo,
    hasRefImages,
    isGenerating,
    textState,
    frameState,
    promptState,
    videoState,
    nextStep,
    patchShot,
    handleGenerateFrames,
    handleGenerateVideoPrompt,
    handleGenerateVideo,
    handleRewriteText,
    saveAssets,
    handleClearFrame,
    saveRefImages,
    activateAssetById,
    saveKeyframePrompt,
    handleAddRefImage,
    handleRemoveRefImage,
    scheduleKeyframeSave,
    setLocalRefPrompts,
    getRefPromptValue,
    handleRefPromptChange,
    handleSwitchRefImageVersion,
    handleUpdateRefPrompt,
    regeneratingRefIds,
    handleRegenerateRefImage,
    handleBatchGenerateRefImagesForShot,
    handleUploadFrame,
    handleFileChange,
    handleCopyPrompt,
    frameAssets,
  };
}
