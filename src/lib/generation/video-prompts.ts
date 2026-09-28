import { extractJSON } from "@/lib/ai/ai-sdk";
import { getModelMaxDuration } from "@/lib/ai/model-limits";
import { buildRefVideoPromptRequest } from "@/lib/ai/prompts/ref-video-prompt-generate";
import { buildVideoPrompt } from "@/lib/ai/prompts/video-generate";
import { resolveSlotContents, resolvePrompt } from "@/lib/ai/prompts/resolver";
import { resolveAIProvider } from "@/lib/ai/provider-factory";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { dialogues, episodes, projects, shots } from "@/lib/db/schema";
import { loadShotAssets } from "@/lib/shot-asset-utils";
import { selectAsset, selectReferences } from "@/lib/shot-assets";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { runShotBatch } from "./batch";
import {
  callProjectAgent,
  findBoundAgent,
  getEpisodeCharacters,
  isCharacterOnScreen,
} from "./common";
import type { GenerationInput } from "./request";

const promptResultsSchema = z
  .array(
    z.object({ sequence: z.number(), videoPrompt: z.string().trim().min(1) }),
  )
  .length(1);

export async function handleSingleVideoPrompt(
  input: GenerationInput<"single_video_prompt">,
) {
  const { projectId, userId, payload, modelConfig } = input;
  const shot = db
    .select()
    .from(shots)
    .where(and(eq(shots.id, payload.shotId), eq(shots.projectId, projectId)))
    .get();
  if (!shot) throw new ApiError(404, "Shot not found");
  if (!input.payload?.overwrite && shot.videoPrompt)
    return {
      shotId: shot.id,
      videoPrompt: shot.videoPrompt,
      status: "skipped",
    };
  const source = shot.episodeId
    ? db
        .select({ mode: episodes.generationMode })
        .from(episodes)
        .where(eq(episodes.id, shot.episodeId))
        .get()
    : db
        .select({ mode: projects.generationMode })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();
  const reference = source?.mode === "reference";
  const category = reference ? "ref_video_prompts" : "video_prompts";
  const agent = await findBoundAgent(projectId, category);
  const characters = await getEpisodeCharacters(projectId, shot.episodeId);
  const duration = Math.min(
    shot.duration ?? 10,
    getModelMaxDuration(modelConfig?.video?.modelId),
  );
  let text: string;
  if (agent) {
    const result = await callProjectAgent(
      agent,
      category,
      JSON.stringify({
        shots: [
          {
            sequence: shot.sequence,
            sceneDescription: shot.prompt,
            motionScript: shot.motionScript,
            videoScript: shot.videoScript,
            cameraDirection: shot.cameraDirection,
            duration,
          },
        ],
        characters: characters.map(({ name, visualHint }) => ({
          name,
          visualHint,
        })),
      }),
    );
    const parsed = promptResultsSchema.safeParse(
      JSON.parse(extractJSON(result.text)),
    );
    const prompt =
      parsed.success &&
      parsed.data.find((entry) => entry.sequence === shot.sequence)
        ?.videoPrompt;
    if (!prompt)
      throw new ApiError(422, "Agent returned no video prompt for this shot");
    text = prompt;
  } else {
    if (!modelConfig?.text) throw new ApiError(400, "No text model configured");
    const assets = await loadShotAssets(shot.id);
    const frames = (
      source?.mode === "reference"
        ? selectReferences(assets)
        : [
            selectAsset(assets, "first_frame"),
            selectAsset(assets, "last_frame"),
          ]
    ).filter((asset) => !!asset?.fileUrl);
    if (!frames.length) throw new ApiError(400, "Generate frames first");
    const names = new Set(frames.flatMap((asset) => asset?.characters ?? []));
    const characterRefs = characters.filter(
      (character) => character.referenceImage && names.has(character.name),
    );
    const motionScript =
      shot.motionScript || shot.videoScript || shot.prompt || "";
    const shotDialogues = db
      .select()
      .from(dialogues)
      .where(eq(dialogues.shotId, shot.id))
      .orderBy(asc(dialogues.sequence))
      .all();
    const dialogueList = shotDialogues.map((dialogue) => {
      const character = characters.find(
        (item) => item.id === dialogue.characterId,
      );
      const name = character?.name ?? "Unknown";
      return {
        characterName: name,
        text: dialogue.text,
        offscreen: !isCharacterOnScreen(
          name,
          motionScript,
          selectAsset(assets, "first_frame")?.prompt,
        ),
        visualHint: character?.visualHint ?? undefined,
      };
    });
    const request = reference
      ? buildRefVideoPromptRequest({
          motionScript,
          cameraDirection: shot.cameraDirection || "static",
          duration,
          characters: characterRefs.map((character, index) => ({
            name: character.name,
            index: index + 1,
            visualHint: character.visualHint,
          })),
          sceneFrames: frames.map((asset, index) => ({
            label: asset?.meta?.sceneName || `场景 ${index + 1}`,
            index: characterRefs.length + index + 1,
          })),
          dialogues: dialogueList,
        })
      : buildVideoPrompt({
          videoScript: motionScript,
          cameraDirection: shot.cameraDirection || "static",
          duration,
          startFrameDesc: selectAsset(assets, "first_frame")?.prompt,
          endFrameDesc: selectAsset(assets, "last_frame")?.prompt,
          characters,
          dialogues: dialogueList,
          slotContents: await resolveSlotContents("video_generate", {
            userId,
            projectId,
          }),
        });
    text = await resolveAIProvider(modelConfig).generateText(request, {
      systemPrompt: reference
        ? await resolvePrompt("ref_video_prompt", { userId, projectId })
        : "根据依次提供的首帧、尾帧及镜头要求，描述两帧之间的动态过程。仅输出视频提示词正文。",
      images: [
        ...(reference
          ? characterRefs.map((character) => character.referenceImage!)
          : []),
        ...frames.map((asset) => asset!.fileUrl!),
      ],
    });
  }
  if (!text.trim())
    throw new ApiError(422, "The model returned an empty video prompt");
  const videoPrompt = `Duration: ${duration}s.\n\n${text.trim()}`;
  await db.update(shots).set({ videoPrompt }).where(eq(shots.id, shot.id));
  return { shotId: shot.id, videoPrompt, status: "ok" };
}

export async function handleBatchVideoPrompt(
  input: GenerationInput<"batch_video_prompt">,
) {
  return runShotBatch(input, (shotId, episodeId) =>
    handleSingleVideoPrompt({
      ...input,
      action: "single_video_prompt",
      episodeId,
      payload: { ...input.payload, shotId },
    }),
  );
}
