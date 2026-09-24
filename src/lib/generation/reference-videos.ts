import { getModelMaxDuration } from "@/lib/ai/model-limits";
import { resolveSlotContents } from "@/lib/ai/prompts/resolver";
import { buildReferenceVideoPrompt } from "@/lib/ai/prompts/video-generate";
import { resolveVideoProvider } from "@/lib/ai/provider-factory";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { characters, dialogues, shots } from "@/lib/db/schema";
import { runShotBatch } from "@/lib/generation/batch";
import {
  extractErrorMessage,
  getVersionedUploadDir,
  isCharacterOnScreen,
} from "@/lib/generation/common";
import type { GenerationInput } from "@/lib/generation/request";
import { insertAssetVersion, loadShotAssets } from "@/lib/shot-asset-utils";
import { selectAsset, selectReferences } from "@/lib/shot-assets";
import { asc, eq } from "drizzle-orm";

export async function handleSingleReferenceVideo(input: GenerationInput) {
  const { projectId, userId, payload, modelConfig } = input;
  const shotId = payload?.shotId as string | undefined;
  if (!shotId) {
    throw new ApiError(400, "No shotId provided");
  }
  if (!modelConfig?.video) {
    throw new ApiError(400, "No video model configured");
  }

  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) {
    throw new ApiError(404, "Shot not found");
  }
  const assets = await loadShotAssets(shot.id);

  const versionedUploadDir = await getVersionedUploadDir(shot.versionId);

  const projectCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, shot.projectId));

  // Collect the union of character names declared on this shot's
  // reference assets — this is the precise set of characters the AI said
  // will act in this shot. Only these get passed to the video model.
  const shotCharNameSet = new Set<string>();
  for (const r of selectReferences(assets)) {
    for (const n of r.characters ?? []) shotCharNameSet.add(n);
  }

  const charRefs = projectCharacters
    .filter((c) => !!c.referenceImage && shotCharNameSet.has(c.name))
    .map((c) => ({ name: c.name, imagePath: c.referenceImage as string }));

  // charRefs may be empty — that's legal for shots with no characters
  // (pure environment / transition shots). Scene-only videos will be
  // generated from scene frames alone.

  // Seedance @ syntax mapping: "@图1是角色A，@图2是角色B"

  const shotDialogues = await db
    .select({
      text: dialogues.text,
      characterId: dialogues.characterId,
      sequence: dialogues.sequence,
    })
    .from(dialogues)
    .where(eq(dialogues.shotId, shotId))
    .orderBy(asc(dialogues.sequence));
  const videoContextForDialogue =
    shot.motionScript || shot.videoScript || shot.prompt || "";

  const dialogueList = shotDialogues.map((d) => {
    const char = projectCharacters.find((c) => c.id === d.characterId);
    const characterName = char?.name ?? "Unknown";
    const onScreen = isCharacterOnScreen(
      characterName,
      videoContextForDialogue,
      selectAsset(assets, "first_frame")?.prompt ?? null,
    );
    const visualHint = onScreen ? char?.visualHint || undefined : undefined;
    return {
      characterName,
      text: d.text,
      offscreen: !onScreen,
      visualHint,
    };
  });

  const ratio = (payload?.ratio as string) || "16:9";
  const refVideoSlots = await resolveSlotContents("ref_video_generate", {
    userId,
    projectId,
  });

  try {
    await db
      .update(shots)
      .set({ status: "generating" })
      .where(eq(shots.id, shotId));

    // Step 1: Collect scene frames (pure environment) — may be multiple per shot
    //         (e.g. ground → sky transitions in an action beat).
    const sceneFramePaths: string[] = selectReferences(assets)
      .filter((r) => r.fileUrl)
      .sort((a, b) => a.sequenceInType - b.sequenceInType)
      .map((r) => r.fileUrl as string);

    if (sceneFramePaths.length === 0) {
      throw new ApiError(
        400,
        "No scene reference images. Please generate scene reference images first.",
      );
    }

    console.log(
      `[SingleReferenceVideo] Shot ${shot.sequence}: ${sceneFramePaths.length} scene frame(s), ${charRefs.length} character ref(s)`,
    );

    // Step 2: Build Seedance 2 multi-reference image list.
    //         Order matters — it becomes 图1, 图2, … in the mapping.
    const orderedRefImages: string[] = [
      ...charRefs.map((c) => c.imagePath),
      ...sceneFramePaths,
    ];

    // Build explicit index mapping for the prompt builder
    const characterRefInfos = charRefs.map((c, i) => ({
      name: c.name,
      index: i + 1,
      visualHint: projectCharacters.find((pc) => pc.name === c.name)
        ?.visualHint,
    }));
    const sceneAssetList = selectReferences(assets)
      .filter((r) => r.fileUrl)
      .sort((a, b) => a.sequenceInType - b.sequenceInType);
    const sceneFrameInfos = sceneFramePaths.map((_, i) => {
      const metaObj = sceneAssetList[i]?.meta as { sceneName?: string } | null;
      const name =
        metaObj?.sceneName ||
        (sceneFramePaths.length > 1 ? `场景-${i + 1}` : `场景`);
      return { label: name, index: charRefs.length + i + 1 };
    });
    const fullMapping =
      [
        ...characterRefInfos.map((c) => `@图片${c.index}是${c.name}`),
        ...sceneFrameInfos.map((s) => `@图片${s.index}是${s.label}`),
      ].join("，") + "。";

    const videoProvider = resolveVideoProvider(modelConfig, versionedUploadDir);

    const videoModelId = modelConfig?.video?.modelId;
    const videoMaxDuration = getModelMaxDuration(videoModelId);
    const effectiveDuration = Math.min(shot.duration ?? 10, videoMaxDuration);

    const prompt =
      shot.videoPrompt ||
      buildReferenceVideoPrompt({
        videoScript: shot.videoScript || shot.motionScript || shot.prompt || "",
        cameraDirection: shot.cameraDirection || "static",
        duration: effectiveDuration,
        characters: projectCharacters,
        dialogues: dialogueList.length > 0 ? dialogueList : undefined,
        slotContents: refVideoSlots,
      });
    const videoPrompt = prompt.includes("图像映射")
      ? prompt
      : `图像映射：${fullMapping}\n\n${prompt}`;

    console.log(
      `[SingleReferenceVideo] Shot ${shot.sequence}: generating video with ${orderedRefImages.length} reference images`,
    );

    const result = await videoProvider.generateVideo({
      initialImage: sceneFramePaths[0],
      prompt: videoPrompt,
      duration: effectiveDuration,
      ratio,
      referenceImages: orderedRefImages,
    });

    await insertAssetVersion({
      shotId,
      type: "reference_video",
      sequenceInType: 0,
      prompt: videoPrompt,
      fileUrl: result.filePath,
      status: "completed",
      meta: result.lastFrameUrl ? { lastFrameUrl: result.lastFrameUrl } : null,
    });
    await db
      .update(shots)
      .set({ status: "completed" })
      .where(eq(shots.id, shotId));

    return { shotId, referenceVideoUrl: result.filePath, status: "ok" };
  } catch (err) {
    console.error(
      `[SingleReferenceVideo] Error for shot ${shot.sequence}:`,
      err,
    );
    await db
      .update(shots)
      .set({ status: "failed" })
      .where(eq(shots.id, shotId));
    throw new ApiError(500, extractErrorMessage(err));
  }
}

export async function handleBatchReferenceVideo(input: GenerationInput) {
  return runShotBatch(input, handleSingleReferenceVideo, ["reference_video"]);
}
