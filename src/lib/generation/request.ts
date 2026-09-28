import { z } from "zod";

const id = z.string().min(1);
const text = z.string().trim().min(1);
const providerSchema = z.object({
  protocol: z.string().min(1),
  baseUrl: z.string(),
  apiKey: z.string(),
  modelId: z.string().min(1),
  secretKey: z.string().optional(),
});
const requestBase = z.object({
  episodeId: id.optional(),
  modelConfig: z
    .object({
      text: providerSchema.nullable().optional(),
      image: providerSchema.nullable().optional(),
      video: providerSchema.nullable().optional(),
    })
    .optional(),
});
const versionPayload = z.object({ versionId: id.optional() });
const batchPayload = versionPayload.extend({
  ratio: z
    .string()
    .regex(/^(16:9|9:16|1:1|adaptive)$/, "Unsupported aspect ratio")
    .optional(),
  overwrite: z.boolean().optional(),
});
const shotPayload = batchPayload.extend({ shotId: id });
const ideaPayload = z.object({ idea: text });

function operation<A extends string, P extends z.ZodType>(
  action: A,
  payload: P,
) {
  return requestBase.extend({ action: z.literal(action), payload });
}

export const generationRequestSchema = z.discriminatedUnion("action", [
  operation("script_outline", ideaPayload),
  operation(
    "script_generate",
    ideaPayload.extend({ outline: z.string().optional() }),
  ),
  operation("script_parse", z.object({}).optional()),
  operation("character_extract", z.object({}).optional()),
  operation("single_character_image", z.object({ characterId: id })),
  operation("batch_character_image", z.object({}).optional()),
  operation("shot_split", z.object({}).optional()),
  operation("generate_keyframe_prompts", versionPayload.optional()),
  operation("generate_ref_prompts", versionPayload.optional()),
  operation(
    "single_shot_rewrite",
    z.object({ shotId: id, versionId: id.optional() }),
  ),
  operation("batch_frame_generate", batchPayload.optional()),
  operation("single_frame_generate", shotPayload),
  operation("single_video_generate", shotPayload),
  operation("batch_video_generate", batchPayload.optional()),
  operation("batch_scene_frame", batchPayload.optional()),
  operation("single_reference_video", shotPayload),
  operation("batch_reference_video", batchPayload.optional()),
  operation("single_video_prompt", shotPayload),
  operation("batch_video_prompt", batchPayload.optional()),
  operation(
    "ai_optimize_text",
    z.object({
      originalText: text,
      instruction: text,
      images: z.array(id).optional(),
    }),
  ),
  operation(
    "video_assemble",
    versionPayload
      .extend({
        generationMode: z.enum(["keyframe", "reference"]).optional(),
      })
      .optional(),
  ),
  operation(
    "single_ref_image_generate",
    shotPayload.extend({ refImageId: id }),
  ),
  operation("single_ref_image_generate_all", shotPayload),
]);

export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GenerationAction = GenerationRequest["action"];
export type GenerationContext = z.infer<typeof requestBase> & {
  projectId: string;
  userId: string;
};
export type GenerationInput<A extends GenerationAction = GenerationAction> =
  Extract<GenerationRequest, { action: A }> & GenerationContext;
export type BatchShotAction =
  | "batch_frame_generate"
  | "batch_video_generate"
  | "batch_scene_frame"
  | "batch_reference_video"
  | "batch_video_prompt";
