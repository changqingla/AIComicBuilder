import { extractJSON } from "@/lib/ai/ai-sdk";
import { buildKeyframePromptsRequest } from "@/lib/ai/prompts/keyframe-prompts";
import { buildRefImagePromptsRequest } from "@/lib/ai/prompts/ref-image-prompts";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import { resolveAIProvider } from "@/lib/ai/provider-factory";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import {
  characterRelations,
  episodes,
  projects,
  shotAssets,
  shots,
} from "@/lib/db/schema";
import {
  insertAssetVersion,
  type UpsertAssetInput,
} from "@/lib/shot-asset-utils";
import { and, asc, eq } from "drizzle-orm";
import pMap from "p-map";
import { z } from "zod";
import {
  callProjectAgent,
  findBoundAgent,
  getEpisodeCharacters,
} from "./common";
import type { GenerationInput } from "./request";

const entrySchema = z.object({
  shotSequence: z.number().int(),
  characters: z.array(z.string()),
});
const keyframeSchema = z.array(
  entrySchema.extend({
    prompts: z.tuple([z.string().min(1), z.string().min(1)]),
  }),
);
const referenceSchema = z.array(
  entrySchema.extend({
    scenes: z
      .array(z.object({ name: z.string(), prompt: z.string().min(1) }))
      .min(1),
  }),
);

export async function handleGenerateAssetPrompts(input: GenerationInput) {
  const { projectId, userId, episodeId, payload, modelConfig } = input;
  const reference = input.action === "generate_ref_prompts";
  const category = reference ? "ref_image_prompts" : "keyframe_prompts";
  const promptKey = reference ? category : "shot_split_keyframe_assets";
  const agent = await findBoundAgent(projectId, category);
  if (!agent && !modelConfig?.text)
    throw new ApiError(400, "No text model configured");
  const targets = db
    .select()
    .from(shots)
    .where(
      and(
        eq(shots.projectId, projectId),
        episodeId ? eq(shots.episodeId, episodeId) : undefined,
        payload?.versionId ? eq(shots.versionId, payload.versionId) : undefined,
      ),
    )
    .orderBy(asc(shots.sequence))
    .all();
  if (!targets.length) throw new ApiError(400, "No shots found");
  const characters = await getEpisodeCharacters(projectId, episodeId);
  const source = episodeId
    ? db
        .select({ script: episodes.script })
        .from(episodes)
        .where(eq(episodes.id, episodeId))
        .get()
    : db
        .select({ script: projects.script })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();
  const script = source?.script ?? "";
  const style = [
    "视觉风格",
    "Visual Style",
    "色彩基调",
    "时代美学",
    "氛围情绪",
    "画幅比例",
  ]
    .map((label) =>
      script.match(new RegExp(`${label}[：:]\\s*(.+?)(?:\\n|$)`))?.[0]?.trim(),
    )
    .filter(Boolean)
    .join("；");
  const relations = db
    .select()
    .from(characterRelations)
    .where(eq(characterRelations.projectId, projectId))
    .all()
    .flatMap((relation) => {
      const a = characters.find(
        (character) => character.id === relation.characterAId,
      );
      const b = characters.find(
        (character) => character.id === relation.characterBId,
      );
      return a && b
        ? [
            `${a.name} ↔ ${b.name}：${relation.relationType} ${relation.description ?? ""}`,
          ]
        : [];
    });
  const relationshipContext = relations.length
    ? `\n\n角色关系：\n${relations.join("\n")}\n${
        reference
          ? "据此规划站位空间和对峙轴线，场景图不画人物。"
          : "敌对角色以活人同屏对峙，禁止用雕像或虚影代替；亲密、友好角色靠近或并肩站位。"
      }`
    : "";
  const systemPrompt = await resolvePrompt(promptKey, { projectId, userId });
  const provider = agent ? null : resolveAIProvider(modelConfig);
  const batches: (typeof targets)[] = [];
  const batchSize = reference ? 8 : 1;
  for (let index = 0; index < targets.length; index += batchSize)
    batches.push(targets.slice(index, index + batchSize));
  let previousScene = "";
  const pending = await pMap(
    batches,
    async (batch): Promise<UpsertAssetInput[]> => {
      const builder = reference
        ? buildRefImagePromptsRequest
        : buildKeyframePromptsRequest;
      const request =
        builder(
          batch.map((shot) => ({ ...shot, prompt: shot.prompt ?? "" })),
          characters,
          style,
        ) +
        relationshipContext +
        (previousScene
          ? `\n前一镜头的结束场景：${previousScene}\n请保持空间与光线连续。`
          : "");
      const text = agent
        ? (
            await callProjectAgent(
              agent,
              category,
              `${systemPrompt}\n\n${request}`,
            )
          ).text
        : await provider!.generateText(request, {
            systemPrompt,
            temperature: 0.5,
          });
      let entries: Array<{
        shotSequence: number;
        characters: string[];
        prompts?: [string, string];
        scenes?: Array<{ name: string; prompt: string }>;
      }>;
      try {
        entries = (reference ? referenceSchema : keyframeSchema).parse(
          JSON.parse(extractJSON(text)),
        );
      } catch (error) {
        throw new ApiError(
          422,
          `Invalid ${category} result: ${error instanceof Error ? error.message : error}`,
        );
      }
      if (
        entries.length !== batch.length ||
        batch.some(
          (shot) =>
            entries.filter((entry) => entry.shotSequence === shot.sequence)
              .length !== 1,
        )
      ) {
        throw new ApiError(
          422,
          "Generated prompts do not match the requested shots",
        );
      }
      return batch.flatMap((shot): UpsertAssetInput[] => {
        const entry = entries.find(
          (entry) => entry.shotSequence === shot.sequence,
        )!;
        if (reference) {
          previousScene = entry.scenes!.at(-1)!.prompt;
          return entry.scenes!.map((scene, sequenceInType) => ({
            shotId: shot.id,
            type: "reference",
            sequenceInType,
            prompt: scene.prompt,
            characters: entry.characters,
            meta: { sceneName: scene.name },
            status: "pending",
          }));
        }
        return entry.prompts!.map((prompt, index) => ({
          shotId: shot.id,
          type: index === 0 ? "first_frame" : "last_frame",
          prompt,
          characters: entry.characters,
          status: "pending",
        }));
      });
    },
    { concurrency: reference ? 1 : 3 },
  );
  // No writes until every model result has been validated.
  db.transaction((tx) => {
    if (reference)
      for (const shot of targets) {
        tx.update(shotAssets)
          .set({ isActive: 0 })
          .where(
            and(
              eq(shotAssets.shotId, shot.id),
              eq(shotAssets.type, "reference"),
            ),
          )
          .run();
      }
    for (const asset of pending.flat()) insertAssetVersion(asset);
  });
  return { updatedCount: targets.length, totalShots: targets.length };
}
