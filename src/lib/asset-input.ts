import { z } from "zod";

export const assetTypeSchema = z.enum(["first_frame", "last_frame", "reference", "keyframe_video", "reference_video"]);
export const assetEditSchema = z.object({
  id: z.string().min(1).optional(),
  sequenceInType: z.number().int().nonnegative(),
  prompt: z.string().default(""),
  characters: z.array(z.string()).nullable().optional(),
  modelProvider: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
});
export const replaceAssetsSchema = z.object({
  type: assetTypeSchema,
  items: z.array(assetEditSchema),
}).refine(({ type, items }) =>
  new Set(items.map((item) => item.sequenceInType)).size === items.length &&
  (type === "reference" || items.every((item) => item.sequenceInType === 0)),
  "Duplicate or invalid asset positions");
