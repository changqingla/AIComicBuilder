/**
 * Helpers for the unified `shot_assets` table.
 *
 * Concept reminder:
 *   - One row = one generated artifact (image or video) attached to a shot.
 *   - `type` discriminates which generation mode/role it belongs to.
 *   - Versioning: regenerating an asset inserts a new row with
 *     (asset_version + 1, is_active = 1) and flips the previous active row
 *     to is_active = 0. The "current" asset is always is_active = 1.
 */

import { db } from "@/lib/db";
import { shotAssets } from "@/lib/db/schema";
import { id as genId } from "@/lib/id";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { ShotAsset, ShotAssetType } from "@/lib/shot-assets";
type ShotAssetStatus = ShotAsset["status"];

function rowToAsset(row: typeof shotAssets.$inferSelect): ShotAsset {
  return {
    id: row.id,
    shotId: row.shotId,
    type: row.type as ShotAssetType,
    sequenceInType: row.sequenceInType,
    assetVersion: row.assetVersion,
    isActive: row.isActive,
    prompt: row.prompt,
    fileUrl: row.fileUrl,
    status: row.status as ShotAssetStatus,
    characters: row.characters ? JSON.parse(row.characters) : null,
    modelProvider: row.modelProvider,
    modelId: row.modelId,
    meta: row.meta ? JSON.parse(row.meta) : null,
  };
}

/** Get all currently-active assets of a given type for a shot, ordered by sequenceInType. */
export async function getActiveAssets(
  shotId: string,
  type: ShotAssetType,
): Promise<ShotAsset[]> {
  const rows = await db
    .select()
    .from(shotAssets)
    .where(
      and(
        eq(shotAssets.shotId, shotId),
        eq(shotAssets.type, type),
        eq(shotAssets.isActive, 1),
      ),
    )
    .orderBy(shotAssets.sequenceInType);
  return rows.map(rowToAsset);
}

/** Get the single currently-active asset for a (shot, type, sequenceInType) slot. */
export async function getActiveAsset(
  shotId: string,
  type: ShotAssetType,
  sequenceInType = 0,
): Promise<ShotAsset | null> {
  const [row] = await db
    .select()
    .from(shotAssets)
    .where(
      and(
        eq(shotAssets.shotId, shotId),
        eq(shotAssets.type, type),
        eq(shotAssets.sequenceInType, sequenceInType),
        eq(shotAssets.isActive, 1),
      ),
    )
    .limit(1);
  return row ? rowToAsset(row) : null;
}

/** Get the full version history (all rows, including inactive) of a slot. */
export async function getAssetHistory(
  shotId: string,
  type: ShotAssetType,
  sequenceInType = 0,
): Promise<ShotAsset[]> {
  const rows = await db
    .select()
    .from(shotAssets)
    .where(
      and(
        eq(shotAssets.shotId, shotId),
        eq(shotAssets.type, type),
        eq(shotAssets.sequenceInType, sequenceInType),
      ),
    )
    .orderBy(desc(shotAssets.assetVersion));
  return rows.map(rowToAsset);
}

export interface UpsertAssetInput {
  shotId: string;
  type: ShotAssetType;
  sequenceInType?: number;
  prompt: string;
  fileUrl?: string | null;
  status?: ShotAssetStatus;
  characters?: string[] | null;
  modelProvider?: string | null;
  modelId?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Insert a new asset version.
 * - If a previous active row exists for the same (shot_id, type, sequence_in_type),
 *   it is flipped to is_active=0 and the new row's asset_version = old + 1.
 * - Otherwise the new row starts at asset_version = 1.
 *
 * Returns the inserted row.
 */
export function insertAssetVersion(input: UpsertAssetInput): ShotAsset {
  return db.transaction((tx) => {
    const sequenceInType = input.sequenceInType ?? 0;
    const slot = and(
      eq(shotAssets.shotId, input.shotId),
      eq(shotAssets.type, input.type),
      eq(shotAssets.sequenceInType, sequenceInType),
    );
    const previous = tx
      .select()
      .from(shotAssets)
      .where(slot)
      .orderBy(desc(shotAssets.assetVersion))
      .get();
    const source =
      tx
        .select()
        .from(shotAssets)
        .where(and(slot, eq(shotAssets.isActive, 1)))
        .get() ?? previous;
    tx.update(shotAssets).set({ isActive: 0 }).where(slot).run();
    const [row] = tx
      .insert(shotAssets)
      .values({
        id: genId(),
        shotId: input.shotId,
        type: input.type,
        sequenceInType,
        assetVersion: (previous?.assetVersion ?? 0) + 1,
        isActive: 1,
        prompt: input.prompt,
        fileUrl: input.fileUrl ?? null,
        status: input.status ?? "pending",
        characters:
          input.characters === undefined
            ? (source?.characters ?? null)
            : input.characters === null
              ? null
              : JSON.stringify(input.characters),
        meta:
          input.meta === undefined
            ? (source?.meta ?? null)
            : input.meta === null
              ? null
              : JSON.stringify(input.meta),
        modelProvider:
          input.modelProvider === undefined
            ? (source?.modelProvider ?? null)
            : input.modelProvider,
        modelId:
          input.modelId === undefined
            ? (source?.modelId ?? null)
            : input.modelId,
      })
      .returning()
      .all();
    return rowToAsset(row);
  });
}

/** Edit metadata on a version. Generated files are only saved by inserting a new version. */
export async function patchAsset(
  assetId: string,
  patch: Partial<{
    status: ShotAssetStatus;
    prompt: string;
    modelProvider: string | null;
    modelId: string | null;
    meta: Record<string, unknown> | null;
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.prompt !== undefined) update.prompt = patch.prompt;
  if (patch.modelProvider !== undefined)
    update.modelProvider = patch.modelProvider;
  if (patch.modelId !== undefined) update.modelId = patch.modelId;
  if (patch.meta !== undefined)
    update.meta = patch.meta ? JSON.stringify(patch.meta) : null;
  await db.update(shotAssets).set(update).where(eq(shotAssets.id, assetId));
}

/** Restore a specific historical version: flips its is_active to 1 and deactivates the rest. */
export async function activateAssetVersion(
  shotId: string,
  type: ShotAssetType,
  sequenceInType: number,
  assetVersion: number,
): Promise<void> {
  db.transaction((tx) => {
    const slot = and(
      eq(shotAssets.shotId, shotId),
      eq(shotAssets.type, type),
      eq(shotAssets.sequenceInType, sequenceInType),
    );
    const target = tx
      .select()
      .from(shotAssets)
      .where(and(slot, eq(shotAssets.assetVersion, assetVersion)))
      .get();
    if (!target) throw new Error("Asset version not found");
    tx.update(shotAssets).set({ isActive: 0 }).where(slot).run();
    tx.update(shotAssets)
      .set({ isActive: 1, updatedAt: new Date() })
      .where(eq(shotAssets.id, target.id))
      .run();
  });
}

export async function loadShotAssets(shotId: string): Promise<ShotAsset[]> {
  const rows = await db
    .select()
    .from(shotAssets)
    .where(eq(shotAssets.shotId, shotId));
  return rows.map(rowToAsset);
}

export async function loadShotAssetsBatch(
  shotIds: string[],
): Promise<Map<string, ShotAsset[]>> {
  if (shotIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(shotAssets)
    .where(inArray(shotAssets.shotId, shotIds));
  const byShot = new Map<string, ShotAsset[]>(shotIds.map((id) => [id, []]));
  for (const row of rows) byShot.get(row.shotId)!.push(rowToAsset(row));
  return byShot;
}
