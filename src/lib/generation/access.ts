import { db } from "@/lib/db";
import {
  characters,
  episodes,
  shotAssets,
  shots,
  storyboardVersions,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { GenerationRequest } from "./request";

export function hasGenerationAccess(
  projectId: string,
  request: GenerationRequest,
): boolean {
  const { episodeId, payload } = request;
  const shotId = payload && "shotId" in payload ? payload.shotId : undefined;
  const characterId =
    payload && "characterId" in payload ? payload.characterId : undefined;
  const versionId =
    payload && "versionId" in payload ? payload.versionId : undefined;
  const refImageId =
    payload && "refImageId" in payload ? payload.refImageId : undefined;
  if (
    episodeId &&
    !db
      .select({ id: episodes.id })
      .from(episodes)
      .where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId)))
      .get()
  )
    return false;
  if (
    versionId &&
    !db
      .select({ id: storyboardVersions.id })
      .from(storyboardVersions)
      .where(
        and(
          eq(storyboardVersions.id, versionId),
          eq(storyboardVersions.projectId, projectId),
          episodeId ? eq(storyboardVersions.episodeId, episodeId) : undefined,
        ),
      )
      .get()
  )
    return false;
  if (
    shotId &&
    !db
      .select({ id: shots.id })
      .from(shots)
      .where(
        and(
          eq(shots.id, shotId),
          eq(shots.projectId, projectId),
          episodeId ? eq(shots.episodeId, episodeId) : undefined,
          versionId ? eq(shots.versionId, versionId) : undefined,
        ),
      )
      .get()
  )
    return false;
  if (
    characterId &&
    !db
      .select({ id: characters.id })
      .from(characters)
      .where(
        and(
          eq(characters.id, characterId),
          eq(characters.projectId, projectId),
        ),
      )
      .get()
  )
    return false;
  if (
    refImageId &&
    (!shotId ||
      !db
        .select({ id: shotAssets.id })
        .from(shotAssets)
        .where(
          and(eq(shotAssets.id, refImageId), eq(shotAssets.shotId, shotId)),
        )
        .get())
  )
    return false;
  return true;
}
