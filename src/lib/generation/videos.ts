import { getModelMaxDuration } from "@/lib/ai/model-limits";
import { resolveSlotContents } from "@/lib/ai/prompts/resolver";
import { buildVideoPrompt } from "@/lib/ai/prompts/video-generate";
import { resolveVideoProvider } from "@/lib/ai/provider-factory";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { characters,dialogues,shots } from "@/lib/db/schema";
import { runShotBatch } from "@/lib/generation/batch";
import { extractErrorMessage,getVersionedUploadDir,isCharacterOnScreen } from "@/lib/generation/common";
import type { GenerationInput } from "@/lib/generation/request";
import { insertAssetVersion,loadShotAssets } from "@/lib/shot-asset-utils";
import { selectAsset } from "@/lib/shot-assets";
import { asc,eq } from "drizzle-orm";

export async function handleSingleVideoGenerate(input: GenerationInput) {
  const { projectId, userId, payload, modelConfig } = input;
  const shotId = payload?.shotId as string;
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
  const firstFrame = selectAsset(assets, "first_frame")?.fileUrl;
  const lastFrame = selectAsset(assets, "last_frame")?.fileUrl;
  if (!firstFrame || !lastFrame) throw new ApiError(400, "Shot frames not generated yet");

  const versionedUploadDir = await getVersionedUploadDir(shot.versionId);

  const shotCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, shot.projectId));
  const characterDescriptions = shotCharacters
    .map((c) => `${c.name}: ${c.description}`)
    .join("\n");

  const shotDialogues = await db
    .select({ text: dialogues.text, characterId: dialogues.characterId, sequence: dialogues.sequence })
    .from(dialogues)
    .where(eq(dialogues.shotId, shotId))
    .orderBy(asc(dialogues.sequence));

  const videoProvider = resolveVideoProvider(modelConfig, versionedUploadDir);
  const videoSlots = await resolveSlotContents("video_generate", { userId, projectId });

  try {
    await db.update(shots).set({ status: "generating" }).where(eq(shots.id, shotId));

    const ratio = (payload?.ratio as string) || "16:9";

    const videoModelId = modelConfig?.video?.modelId;
    const videoMaxDuration = getModelMaxDuration(videoModelId);
    const effectiveDuration = Math.min(shot.duration ?? 10, videoMaxDuration);

    const videoScript = shot.videoScript || shot.motionScript || shot.prompt || "";
    const videoContextForDialogue = videoScript;
    const onScreenDialogueChars = shotDialogues
      .map((d) => shotCharacters.find((c) => c.id === d.characterId)?.name ?? "Unknown")
      .filter((name) => isCharacterOnScreen(name, videoContextForDialogue, (selectAsset(assets, "first_frame")?.prompt ?? null)));

    const dialogueList = shotDialogues.map((d) => {
      const char = shotCharacters.find((c) => c.id === d.characterId);
      const characterName = char?.name ?? "Unknown";
      const onScreen = isCharacterOnScreen(characterName, videoContextForDialogue, (selectAsset(assets, "first_frame")?.prompt ?? null));
      const visualHint = onScreen ? (char?.visualHint || undefined) : undefined;
      return {
        characterName,
        text: d.text,
        offscreen: !onScreen,
        visualHint,
      };
    });
    const videoPrompt = shot.videoPrompt || buildVideoPrompt({
      videoScript,
      cameraDirection: shot.cameraDirection || "static",
      startFrameDesc: (selectAsset(assets, "first_frame")?.prompt ?? null) ?? undefined,
      endFrameDesc: (selectAsset(assets, "last_frame")?.prompt ?? null) ?? undefined,
      duration: effectiveDuration,
      characters: shotCharacters,
      dialogues: dialogueList.length > 0 ? dialogueList : undefined,
      slotContents: videoSlots,
    });

    const result = await videoProvider.generateVideo({
      firstFrame,
      lastFrame,
      prompt: videoPrompt,
      duration: effectiveDuration,
      ratio,
    });

    // Track video history via shot_assets keyframe_video slot
    await insertAssetVersion({
      shotId, type: "keyframe_video", sequenceInType: 0,
      prompt: videoPrompt, fileUrl: result.filePath, status: "completed",
    });

    await db
      .update(shots)
      .set({ status: "completed" })
      .where(eq(shots.id, shotId));

    return { shotId, videoUrl: result.filePath, status: "ok" };
  } catch (err) {
    console.error(`[SingleVideoGenerate] Error for shot ${shotId}:`, err);
    await db.update(shots).set({ status: "failed" }).where(eq(shots.id, shotId));
    throw new ApiError(500, extractErrorMessage(err));
  }
}

export async function handleBatchVideoGenerate(input: GenerationInput) {
  return runShotBatch(input, handleSingleVideoGenerate, ["keyframe_video"]);
}
