import { createLanguageModel, extractJSON } from "@/lib/ai/ai-sdk";
import { getModelMaxDuration } from "@/lib/ai/model-limits";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import { buildShotSplitPrompt } from "@/lib/ai/prompts/shot-split";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import {
  characterRelations,
  dialogues,
  episodes,
  projects,
  shots,
  storyboardVersions,
} from "@/lib/db/schema";
import { id as genId } from "@/lib/id";
import {
  getActiveAsset,
  insertAssetVersion,
  loadShotAssets,
  patchAsset,
} from "@/lib/shot-asset-utils";
import { selectAsset } from "@/lib/shot-assets";
import { generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import pMap from "p-map";
import { z } from "zod";
import {
  callProjectAgent,
  extractErrorMessage,
  findBoundAgent,
  getEpisodeCharacters,
} from "./common";
import type { GenerationInput } from "./request";

const shotResultSchema = z
  .array(
    z.object({
      sequence: z.number().int().positive(),
      sceneDescription: z.string().min(1),
      motionScript: z.string(),
      videoScript: z.string(),
      duration: z.number().positive(),
      dialogues: z.array(z.object({ character: z.string(), text: z.string() })),
      cameraDirection: z.string(),
      characters: z.array(z.string()),
      transitionIn: z.string().default("cut"),
      transitionOut: z.string().default("cut"),
      compositionGuide: z.string().default(""),
      focalPoint: z.string().default(""),
      depthOfField: z.string().default("medium"),
      soundDesign: z.string().default(""),
      musicCue: z.string().default(""),
    }),
  )
  .min(1);

export async function handleShotSplit(input: GenerationInput) {
  const { projectId, userId, modelConfig, episodeId } = input;
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  const episode = episodeId
    ? db.select().from(episodes).where(eq(episodes.id, episodeId)).get()
    : null;
  const script = episodeId ? episode?.script : project?.script;
  if (!script?.trim())
    throw new ApiError(400, "没有剧本内容，请先编写或生成剧本");
  const agent = await findBoundAgent(projectId, "shot_split");
  if (!agent && !modelConfig?.text)
    throw new ApiError(400, "No text model configured");
  const model = agent ? null : createLanguageModel(modelConfig!.text!);
  const characters = await getEpisodeCharacters(projectId, episodeId);
  const descriptions = characters
    .map((character) => `${character.name}: ${character.description}`)
    .join("\n");
  const visualHints = characters
    .filter((character) => character.visualHint)
    .map((character) => ({
      name: character.name,
      visualHint: character.visualHint!,
    }));
  const performanceStyles = characters
    .filter((character) => character.performanceStyle)
    .map((character) => ({
      name: character.name,
      performanceStyle: character.performanceStyle!,
    }));
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
  const context = [
    project?.worldSetting ? `世界观设定：${project.worldSetting}` : "",
    relations.length
      ? `角色关系（用于决定站位、眼神与肢体互动）：\n${relations.join("\n")}\n敌对角色必须作为活人同屏对峙，禁止用雕像、虚影代替。`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const system = await resolvePrompt(
    "shot_split",
    { userId, projectId },
    { maxDuration: getModelMaxDuration(modelConfig?.video?.modelId) },
  );
  const chunks = splitScriptByScenes(script, 8);
  const targetDuration = episode?.targetDuration || project?.targetDuration;
  const results = await pMap(
    chunks,
    async (chunk, index) => {
      const duration = targetDuration
        ? `\n本批目标时长约 ${Math.round((targetDuration * chunk.length) / chunks.reduce((sum, item) => sum + item.length, 0))} 秒。`
        : "";
      const prompt =
        buildShotSplitPrompt(
          chunk,
          descriptions,
          visualHints,
          undefined,
          performanceStyles,
        ) +
        "\n" +
        context +
        duration;
      const text = agent
        ? (
            await callProjectAgent(
              agent,
              "shot_split",
              `${system}\n\n${prompt}`,
            )
          ).text
        : (await generateText({ model: model!, system, prompt })).text;
      try {
        return shotResultSchema.parse(JSON.parse(extractJSON(text)));
      } catch (error) {
        throw new ApiError(
          422,
          `Shot chunk ${index + 1} failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    },
    { concurrency: 3 },
  );
  const allShots = results.flat();
  // External requests finish before the short transaction creates a complete version.
  return db.transaction((tx) => {
    const latest = tx
      .select()
      .from(storyboardVersions)
      .where(
        and(
          eq(storyboardVersions.projectId, projectId),
          episodeId ? eq(storyboardVersions.episodeId, episodeId) : undefined,
        ),
      )
      .orderBy(desc(storyboardVersions.versionNum))
      .get();
    const versionNum = (latest?.versionNum ?? 0) + 1;
    const now = new Date();
    const versionId = genId();
    tx.insert(storyboardVersions)
      .values({
        id: versionId,
        projectId,
        episodeId: episodeId ?? null,
        versionNum,
        label: `${now.toISOString().slice(0, 10).replaceAll("-", "")}-V${versionNum}`,
        createdAt: now,
      })
      .run();
    allShots.forEach((shot, index) => {
      const { sceneDescription, dialogues: lines } = shot;
      const shotId = genId();
      tx.insert(shots)
        .values({
          motionScript: shot.motionScript,
          videoScript: shot.videoScript,
          duration: shot.duration,
          cameraDirection: shot.cameraDirection,
          transitionIn: shot.transitionIn,
          transitionOut: shot.transitionOut,
          compositionGuide: shot.compositionGuide,
          focalPoint: shot.focalPoint,
          depthOfField: shot.depthOfField,
          soundDesign: shot.soundDesign,
          musicCue: shot.musicCue,
          id: shotId,
          projectId,
          episodeId: episodeId ?? null,
          versionId,
          sequence: index + 1,
          prompt: sceneDescription,
        })
        .run();
      lines.forEach((line, sequence) => {
        const character = characters.find(
          (character) => character.name === line.character,
        );
        if (character)
          tx.insert(dialogues)
            .values({
              id: genId(),
              shotId,
              characterId: character.id,
              text: line.text,
              sequence,
            })
            .run();
      });
    });
    return { shots: allShots.length, versionId };
  });
}

export function splitScriptByScenes(
  script: string,
  maxScenes: number,
): string[] {
  // Match SCENE markers with optional markdown bold (**), whitespace, or other decorators
  const scenePattern = /^[\s*#]*(?:SCENE|场景)\s*\d+/i;
  const lines = script.split("\n");

  // Find scene boundary line indices
  const boundaries: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (scenePattern.test(lines[i].trim())) {
      boundaries.push(i);
    }
  }

  // If no scene markers found or few scenes, return as single chunk
  if (boundaries.length <= maxScenes) {
    return [script];
  }

  // Everything before the first SCENE marker is the header (VISUAL STYLE + CHARACTERS)
  const header = lines.slice(0, boundaries[0]).join("\n").trim();

  // Group scenes into chunks, prepend header to each
  const chunks: string[] = [];
  for (let i = 0; i < boundaries.length; i += maxScenes) {
    const start = boundaries[i];
    const end =
      i + maxScenes < boundaries.length
        ? boundaries[i + maxScenes]
        : lines.length;
    const scenesText = lines.slice(start, end).join("\n");
    chunks.push(header ? `${header}\n\n${scenesText}` : scenesText);
  }

  return chunks;
}

export async function handleSingleShotRewrite(input: GenerationInput) {
  const { projectId, payload, modelConfig, episodeId } = input;
  const shotId = payload?.shotId as string;
  if (!shotId) {
    throw new ApiError(400, "No shotId provided");
  }
  if (!modelConfig?.text) {
    throw new ApiError(400, "No text model configured");
  }

  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) {
    throw new ApiError(404, "Shot not found");
  }
  const assets = await loadShotAssets(shot.id);

  const shotEpisodeId = episodeId || shot.episodeId;
  const projectCharacters = await getEpisodeCharacters(
    projectId,
    shotEpisodeId,
  );
  const characterDescriptions = projectCharacters
    .map((c) => `${c.name}: ${c.description}`)
    .join("\n");
  const characterVisualHints = projectCharacters
    .filter((c) => c.visualHint)
    .map((c) => `${c.name}：${c.visualHint}`)
    .join("\n");

  const model = createLanguageModel(modelConfig.text);

  const prompt = `You are a storyboard director. Rewrite the text fields for a single shot so the descriptions are vivid, safe for AI image generation, and free of any potentially sensitive content.

Current shot (sequence ${shot.sequence}):
- Scene description: ${shot.prompt || ""}
- Start frame: ${(selectAsset(assets, "first_frame")?.prompt ?? null) || ""}
- End frame: ${(selectAsset(assets, "last_frame")?.prompt ?? null) || ""}
- Motion script: ${shot.motionScript || ""}
- Video script: ${shot.videoScript || ""}
- Camera direction: ${shot.cameraDirection || "static"}
- Duration: ${shot.duration}s

Character references:
${characterDescriptions || "none"}
${characterVisualHints ? `\nCHARACTER VISUAL IDs (MANDATORY — whenever a character appears in any field, write their name followed by exactly this identifier in parentheses, e.g. 天枢真君（银发金瞳）. Never invent alternatives):\n${characterVisualHints}` : ""}

Return ONLY a JSON object (no markdown fences) with these fields:
{
  "prompt": "rewritten scene description",
  "startFrameDesc": "rewritten start frame description",
  "endFrameDesc": "rewritten end frame description",
  "motionScript": "rewritten motion script in time-segmented format (0-Xs: ... Xs-Ys: ...)",
  "videoScript": "rewritten concise video model prompt: 1-2 sentences, no timestamps, just core motion and camera arc",
  "cameraDirection": "camera direction (keep original or adjust)"
}

IMPORTANT: Keep the same scene, characters, and narrative intent. Only rephrase to avoid safety filter triggers. Match the language of the original text.`;

  console.log(`[SingleShotRewrite] Shot ${shot.sequence} prompt:\n${prompt}`);

  try {
    const { text } = await import("ai").then(({ generateText }) =>
      generateText({ model, prompt, temperature: 0.7 }),
    );

    const parsed = JSON.parse(extractJSON(text)) as {
      prompt: string;
      startFrameDesc: string;
      endFrameDesc: string;
      motionScript: string;
      videoScript?: string;
      cameraDirection: string;
    };

    await db
      .update(shots)
      .set({
        prompt: parsed.prompt,
        motionScript: parsed.motionScript,
        videoScript: parsed.videoScript ?? null,
        cameraDirection: parsed.cameraDirection,
      })
      .where(eq(shots.id, shotId));
    // Update first/last frame prompts in shot_assets
    {
      const ff = await getActiveAsset(shotId, "first_frame", 0);
      if (ff) {
        await patchAsset(ff.id, { prompt: parsed.startFrameDesc });
      } else {
        await insertAssetVersion({
          shotId,
          type: "first_frame",
          sequenceInType: 0,
          prompt: parsed.startFrameDesc,
          status: "pending",
        });
      }
      const lf = await getActiveAsset(shotId, "last_frame", 0);
      if (lf) {
        await patchAsset(lf.id, { prompt: parsed.endFrameDesc });
      } else {
        await insertAssetVersion({
          shotId,
          type: "last_frame",
          sequenceInType: 0,
          prompt: parsed.endFrameDesc,
          status: "pending",
        });
      }
    }

    return { shotId, status: "ok", ...parsed };
  } catch (err) {
    console.error(`[SingleShotRewrite] Error for shot ${shotId}:`, err);
    throw new ApiError(500, extractErrorMessage(err));
  }
}
