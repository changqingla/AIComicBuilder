import { db } from "@/lib/db";
import { shots } from "@/lib/db/schema";
import { loadShotAssetsBatch } from "@/lib/shot-asset-utils";
import { selectAsset,type ShotAssetType } from "@/lib/shot-assets";
import { and,asc,eq } from "drizzle-orm";
import pMap from "p-map";
import type { GenerationInput } from "./request";

export async function runShotBatch(
  input: GenerationInput,
  generate: (input: GenerationInput) => Promise<unknown>,
  completedTypes: ShotAssetType[] = [],
) {
  const { projectId, episodeId, payload } = input;
  const items = await db.select().from(shots).where(and(
    eq(shots.projectId, projectId),
    episodeId ? eq(shots.episodeId, episodeId) : undefined,
    payload?.versionId ? eq(shots.versionId, payload.versionId) : undefined,
  )).orderBy(asc(shots.sequence));
  const assets = await loadShotAssetsBatch(items.map((shot) => shot.id));
  const results = await pMap(items, async (shot) => {
    const identity = { shotId: shot.id, sequence: shot.sequence };
    if (!payload?.overwrite && completedTypes.length > 0 &&
      completedTypes.every((type) => selectAsset(assets.get(shot.id), type)?.fileUrl)) {
      return { ...identity, status: "skipped" as const };
    }
    try {
      await generate({ ...input, episodeId: shot.episodeId ?? undefined,
        payload: { ...payload, shotId: shot.id } });
      return { ...identity, status: "ok" as const };
    } catch (error) {
      return { ...identity, status: "error" as const,
        error: error instanceof Error ? error.message : String(error) };
    }
  }, { concurrency: 3 });
  return { results };
}
