/**
 * One row from the unified `shot_assets` table, exposed to the frontend.
 * type discriminates the role:
 *   - 'first_frame' / 'last_frame'  → keyframe-mode image assets
 *   - 'reference'                   → reference-mode image assets (multi)
 *   - 'keyframe_video'              → keyframe-mode video output
 *   - 'reference_video'             → reference-mode video output
 */
export type ShotAssetType =
  | "first_frame"
  | "last_frame"
  | "reference"
  | "keyframe_video"
  | "reference_video";

export interface ShotAsset {
  id: string;
  shotId: string;
  type: ShotAssetType;
  sequenceInType: number;
  assetVersion: number;
  isActive: number;
  prompt: string;
  fileUrl: string | null;
  status: "pending" | "generating" | "completed" | "failed";
  characters: string[] | null;
  modelProvider?: string | null;
  modelId?: string | null;
  meta?: { sceneName?: string; [key: string]: unknown } | null;
}

type ShotLike = { assets: readonly ShotAsset[] };

function safeAssets(shot: ShotLike): ShotAsset[] {
  return [...shot.assets];
}

/** Active assets only — `isActive === 1`. Use this for "current" reads. */
function activeAssets(shot: ShotLike): ShotAsset[] {
  return safeAssets(shot).filter((a) => a.isActive === 1);
}

/**
 * All version history rows for one slot (shot, type, sequenceInType),
 * sorted newest first by assetVersion. Use this to render history arrows.
 */
export function getAssetHistoryForSlot(
  shot: ShotLike,
  type: ShotAssetType,
  sequenceInType = 0,
): ShotAsset[] {
  return safeAssets(shot)
    .filter((a) => a.type === type && a.sequenceInType === sequenceInType)
    .sort((a, b) => b.assetVersion - a.assetVersion);
}

/** Get the active first_frame image URL for a shot, or null. */
export function getFirstFrameUrl(shot: ShotLike): string | null {
  return (
    activeAssets(shot).find(
      (a) => a.type === "first_frame" && a.sequenceInType === 0,
    )?.fileUrl ?? null
  );
}

/** Get the active last_frame image URL for a shot, or null. */
export function getLastFrameUrl(shot: ShotLike): string | null {
  return (
    activeAssets(shot).find(
      (a) => a.type === "last_frame" && a.sequenceInType === 0,
    )?.fileUrl ?? null
  );
}

/** Get the keyframe-mode video URL, or null. */
export function getKeyframeVideoUrl(shot: ShotLike): string | null {
  return (
    activeAssets(shot).find(
      (a) => a.type === "keyframe_video" && a.sequenceInType === 0,
    )?.fileUrl ?? null
  );
}

/** Get the reference-mode video URL, or null. */
export function getReferenceVideoUrl(shot: ShotLike): string | null {
  return (
    activeAssets(shot).find(
      (a) => a.type === "reference_video" && a.sequenceInType === 0,
    )?.fileUrl ?? null
  );
}

/** Get all active reference image assets ordered by sequence_in_type. */
export function getReferenceAssets(shot: ShotLike): ShotAsset[] {
  return activeAssets(shot)
    .filter((a) => a.type === "reference")
    .sort((a, b) => a.sequenceInType - b.sequenceInType);
}

/** First reference image URL (used as the "scene reference frame"). */
export function getSceneRefFrameUrl(shot: ShotLike): string | null {
  return getReferenceAssets(shot)[0]?.fileUrl ?? null;
}

/** First-frame prompt text (the LLM-generated description). */
export function getFirstFramePrompt(shot: ShotLike): string | null {
  return (
    activeAssets(shot).find(
      (a) => a.type === "first_frame" && a.sequenceInType === 0,
    )?.prompt ?? null
  );
}

/** Last-frame prompt text. */
export function getLastFramePrompt(shot: ShotLike): string | null {
  return (
    activeAssets(shot).find(
      (a) => a.type === "last_frame" && a.sequenceInType === 0,
    )?.prompt ?? null
  );
}

/** Whether all reference images for a shot have been generated (have file_url). */
export function hasAllReferenceImages(shot: ShotLike): boolean {
  const refs = getReferenceAssets(shot);
  return refs.length > 0 && refs.every((r) => !!r.fileUrl);
}

/** Whether the shot has both first and last frame image URLs. */
export function hasKeyframePair(shot: ShotLike): boolean {
  return !!getFirstFrameUrl(shot) && !!getLastFrameUrl(shot);
}

export function selectAsset(
  assets: readonly ShotAsset[] = [],
  type: ShotAssetType,
  sequenceInType = 0,
) {
  return assets.find(
    (asset) =>
      asset.isActive === 1 &&
      asset.type === type &&
      asset.sequenceInType === sequenceInType,
  );
}

export function selectReferences(assets: readonly ShotAsset[] = []) {
  return assets
    .filter((asset) => asset.isActive === 1 && asset.type === "reference")
    .sort((a, b) => a.sequenceInType - b.sequenceInType);
}
