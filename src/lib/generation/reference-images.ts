import { resolveImageProvider } from "@/lib/ai/provider-factory";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { shots } from "@/lib/db/schema";
import { insertAssetVersion, loadShotAssets } from "@/lib/shot-asset-utils";
import { selectReferences } from "@/lib/shot-assets";
import { eq } from "drizzle-orm";
import { runShotBatch } from "./batch";
import { getVersionedUploadDir, ratioToImageOpts } from "./common";
import type { GenerationInput } from "./request";

export async function handleSingleRefImageGenerate(input: GenerationInput) {
  const { payload, modelConfig } = input;
  const shotId = payload?.shotId as string;
  const refImageId = payload?.refImageId as string;

  if (!shotId || !refImageId) {
    throw new ApiError(400, "Missing shotId or refImageId");
  }
  if (!modelConfig?.image) {
    throw new ApiError(400, "No image model configured");
  }

  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) {
    throw new ApiError(404, "Shot not found");
  }

  const assets = await loadShotAssets(shot.id);
  const refImages = selectReferences(assets);
  const entry = refImages.find((r) => r.id === refImageId);
  if (!entry) {
    throw new ApiError(404, "Reference image not found");
  }
  if (!entry.prompt.trim()) {
    throw new ApiError(400, "No prompt provided");
  }

  console.log(
    `[SingleRefImage] Shot ${shot.sequence}: generating scene-only ref image "${refImageId}"`,
  );

  const ratio = (payload?.ratio as string) || "16:9";
  const imgOpts = ratioToImageOpts(ratio);
  const imageProvider = resolveImageProvider(
    modelConfig,
    await getVersionedUploadDir(shot.versionId),
  );

  try {
    // Scene-only: do NOT inject character references here.
    const imagePath = await imageProvider.generateImage(entry.prompt, {
      quality: "hd",
      ...imgOpts,
    });

    await insertAssetVersion({
      shotId,
      type: "reference",
      sequenceInType: entry.sequenceInType,
      prompt: entry.prompt,
      fileUrl: imagePath,
      status: "completed",
      characters: entry.characters ?? undefined,
    });

    return { ok: true, imagePath };
  } catch (err) {
    throw new ApiError(500, `Generation failed: ${err}`);
  }
}

export async function handleSingleShotRefImageGenerateAll(
  input: GenerationInput,
) {
  const shotId = input.payload?.shotId;
  if (!shotId) throw new ApiError(400, "No shotId provided");
  const refs = selectReferences(await loadShotAssets(shotId)).filter(
    (asset) =>
      asset.prompt.trim() &&
      (input.payload?.overwrite ||
        !asset.fileUrl ||
        asset.status === "pending"),
  );
  const results = [];
  for (const asset of refs) {
    // A failed image is reported as a failed shot; completed versions are retained for retry.
    await handleSingleRefImageGenerate({
      ...input,
      payload: { ...input.payload, refImageId: asset.id },
    });
    results.push(asset.id);
  }
  return {
    generated: results.length,
    total: refs.length,
    status: results.length ? "ok" : "skipped",
  };
}

export async function handleBatchSceneFrame(input: GenerationInput) {
  return runShotBatch(input, handleSingleShotRefImageGenerateAll);
}
