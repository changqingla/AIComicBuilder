import { db } from "@/lib/db";
import { characters,episodes,shotAssets,shots,storyboardVersions } from "@/lib/db/schema";
import { and,eq } from "drizzle-orm";
import { z } from "zod";

export const generationRequestSchema = z.object({
  action: z.enum([
    "script_outline", "script_generate", "script_parse", "character_extract",
    "single_character_image", "batch_character_image", "shot_split",
    "generate_keyframe_prompts", "single_shot_rewrite", "batch_frame_generate",
    "single_frame_generate", "single_video_generate", "batch_video_generate",
    "single_scene_frame", "batch_scene_frame", "single_reference_video",
    "batch_reference_video", "single_video_prompt", "batch_video_prompt",
    "ai_optimize_text", "video_assemble", "batch_ref_image_generate",
    "single_ref_image_generate", "generate_ref_prompts", "single_ref_image_generate_all",
  ]),
  episodeId: z.string().min(1).optional(),
  payload: z.object({
    shotId: z.string().min(1).optional(),
    characterId: z.string().min(1).optional(),
    versionId: z.string().min(1).optional(),
    refImageId: z.string().min(1).optional(),
  }).catchall(z.unknown()).optional(),
  modelConfig: z.object({
    text: providerSchema().nullable().optional(),
    image: providerSchema().nullable().optional(),
    video: providerSchema().nullable().optional(),
  }).optional(),
});

function providerSchema() {
  return z.object({
    protocol: z.string(), baseUrl: z.string(), apiKey: z.string(),
    modelId: z.string(), secretKey: z.string().optional(),
  });
}

export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GenerationInput = GenerationRequest & { projectId: string; userId: string };

export function hasGenerationAccess(projectId: string, request: GenerationRequest): boolean {
  const { episodeId, payload } = request;
  const { shotId, characterId, versionId, refImageId } = payload ?? {};
  if (episodeId && !db.select({ id: episodes.id }).from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId))).get()) return false;
  if (versionId && !db.select({ id: storyboardVersions.id }).from(storyboardVersions)
    .where(and(eq(storyboardVersions.id, versionId), eq(storyboardVersions.projectId, projectId),
      episodeId ? eq(storyboardVersions.episodeId, episodeId) : undefined)).get()) return false;
  if (shotId && !db.select({ id: shots.id }).from(shots)
    .where(and(eq(shots.id, shotId), eq(shots.projectId, projectId),
      episodeId ? eq(shots.episodeId, episodeId) : undefined,
      versionId ? eq(shots.versionId, versionId) : undefined)).get()) return false;
  if (characterId && !db.select({ id: characters.id }).from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.projectId, projectId))).get()) return false;
  if (refImageId && (!shotId || !db.select({ id: shotAssets.id }).from(shotAssets)
    .where(and(eq(shotAssets.id, refImageId), eq(shotAssets.shotId, shotId))).get())) return false;
  return true;
}
