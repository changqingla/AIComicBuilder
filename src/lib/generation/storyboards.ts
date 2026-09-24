import { createLanguageModel,extractJSON } from "@/lib/ai/ai-sdk";
import { getModelMaxDuration } from "@/lib/ai/model-limits";
import { getPromptDefinition } from "@/lib/ai/prompts/registry";
import { resolveSlotContents } from "@/lib/ai/prompts/resolver";
import { buildShotSplitPrompt } from "@/lib/ai/prompts/shot-split";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { characterRelations,characters,dialogues,episodeCharacters,episodes,projects,shots,storyboardVersions } from "@/lib/db/schema";
import { callAndValidateAgent,extractErrorMessage,findBoundAgent,getEpisodeCharacters } from "@/lib/generation/common";
import type { GenerationInput } from "@/lib/generation/request";
import { id as genId } from "@/lib/id";
import { getActiveAsset,insertAssetVersion,loadShotAssets,patchAsset } from "@/lib/shot-asset-utils";
import { selectAsset } from "@/lib/shot-assets";
import { generateText } from "ai";
import { and,desc,eq,inArray } from "drizzle-orm";

export async function handleShotSplitStream(input: GenerationInput) {
  const { projectId, userId, modelConfig, episodeId } = input;
  let script: string | null = null;
  let generationMode: string = "keyframe";
  if (episodeId) {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode) {
      throw new ApiError(404, "Episode not found");
    }
    script = episode.script ?? null;
    generationMode = episode.generationMode ?? "keyframe";
  } else {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      throw new ApiError(404, "Project not found");
    }
    script = project.script ?? null;
    generationMode = project.generationMode ?? "keyframe";
  }

  // === 智能体路由 ===
  console.log(`[ShotSplit] projectId=${projectId}, episodeId=${episodeId}, script length=${script?.length ?? 0}`);
  {
    const boundAgent = await findBoundAgent(projectId, "shot_split");
    if (boundAgent) {
      if (!script) {
        // Agent 模式下也需要剧本 — 尝试从 episode 或 project 重新获取
        if (episodeId) {
          const [ep] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
          script = ep?.script ?? null;
        }
        if (!script) {
          const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
          script = proj?.script ?? null;
        }
        if (!script) {
          throw new ApiError(400, "没有剧本内容，请先编写或生成剧本");
        }
      }
      const agentResult = await callAndValidateAgent(boundAgent, "shot_split", script);

      // Parse agent output and save to DB (same logic as built-in pipeline)
      const agentParsed = JSON.parse(extractJSON(agentResult.text));
      let agentShots: ParsedShot[];
      if (Array.isArray(agentParsed) && agentParsed.length > 0 && agentParsed[0].shots) {
        agentShots = agentParsed.flatMap((scene: { sceneDescription?: string; shots?: ParsedShot[] }) =>
          (scene.shots || []).map((s) => ({ ...s, sceneDescription: s.sceneDescription || scene.sceneDescription || "" }))
        );
      } else if (Array.isArray(agentParsed)) {
        agentShots = agentParsed;
      } else {
        agentShots = agentParsed.shots || [];
      }
      agentShots.forEach((s, i) => { s.sequence = i + 1; });

      if (agentShots.length === 0) {
        throw new ApiError(422, "智能体未返回有效分镜数据");
      }

      // Fetch characters for dialogue matching
      const agentCharacters = await getEpisodeCharacters(projectId, episodeId);

      // Create version
      const agentVerWhere = episodeId
        ? and(eq(storyboardVersions.projectId, projectId), eq(storyboardVersions.episodeId, episodeId))
        : eq(storyboardVersions.projectId, projectId);
      const [agentMaxVer] = await db.select({ maxNum: storyboardVersions.versionNum })
        .from(storyboardVersions).where(agentVerWhere).orderBy(desc(storyboardVersions.versionNum)).limit(1);
      const agentNextVer = (agentMaxVer?.maxNum ?? 0) + 1;
      const agentDate = new Date();
      const agentDateStr = agentDate.getUTCFullYear().toString() +
        String(agentDate.getUTCMonth() + 1).padStart(2, "0") +
        String(agentDate.getUTCDate()).padStart(2, "0");
      const agentVersionId = genId();
      await db.insert(storyboardVersions).values({
        id: agentVersionId, projectId, label: `${agentDateStr}-V${agentNextVer}`,
        versionNum: agentNextVer, createdAt: agentDate, episodeId: episodeId ?? null,
      });

      for (const shot of agentShots) {
        const shotId = genId();
        await db.insert(shots).values({
          id: shotId, projectId, versionId: agentVersionId,
          sequence: shot.sequence,
          prompt: shot.startFrame || shot.sceneDescription || "",
          motionScript: shot.motionScript || "",
          videoScript: shot.videoScript ?? null,
          cameraDirection: shot.cameraDirection || "static",
          duration: shot.duration || 8,
          transitionIn: shot.transitionIn || "cut",
          transitionOut: shot.transitionOut || "cut",
          compositionGuide: shot.compositionGuide || "",
          focalPoint: shot.focalPoint || "",
          depthOfField: shot.depthOfField || "medium",
          soundDesign: shot.soundDesign || "",
          musicCue: shot.musicCue || "",
          episodeId: episodeId ?? null,
        });
        for (let i = 0; i < (shot.dialogues || []).length; i++) {
          const d = shot.dialogues[i];
          const mc = agentCharacters.find((c) => c.name === d.character);
          if (mc) {
            await db.insert(dialogues).values({ id: genId(), shotId, characterId: mc.id, text: d.text, sequence: i });
          }
        }
      }
      console.log(`[ShotSplit Agent] Created ${agentShots.length} shots`);
      return { shots: agentShots.length };
    }
  }
  // === 智能体路由结束 ===

  if (!modelConfig?.text) {
    throw new ApiError(400, "No text model configured");
  }

  // Fetch only characters linked to this episode
  let shotCharacters: typeof characters.$inferSelect[];
  if (episodeId) {
    const linkedIds = await db
      .select({ characterId: episodeCharacters.characterId })
      .from(episodeCharacters)
      .where(eq(episodeCharacters.episodeId, episodeId));
    shotCharacters = linkedIds.length > 0
      ? await db.select().from(characters).where(inArray(characters.id, linkedIds.map((r) => r.characterId)))
      : [];
  } else {
    shotCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId));
  }

  const characterDescriptions = shotCharacters
    .map((c) => `${c.name}: ${c.description}`)
    .join("\n");

  const characterVisualHints = shotCharacters
    .filter((c) => c.visualHint)
    .map((c) => ({ name: c.name, visualHint: c.visualHint! }));

  const characterPerformanceStyles = shotCharacters
    .filter((c) => c.performanceStyle)
    .map((c) => ({ name: c.name, performanceStyle: c.performanceStyle! }));

  // Load character relationships — CRITICAL for shot planning. Without
  // this block the LLM treats enemies as bystanders (e.g. "如来佛祖" gets
  // rendered as a Buddha statue in the background instead of an active
  // combatant against 孙悟空).
  const shotRelations = await db
    .select()
    .from(characterRelations)
    .where(eq(characterRelations.projectId, projectId));
  let relationsText = "";
  if (shotRelations.length > 0) {
    relationsText = "\n\n## 角色关系（必须用于决定站位、眼神、肢体对抗、画面张力）\n";
    for (const rel of shotRelations) {
      const charA = shotCharacters.find((c) => c.id === rel.characterAId);
      const charB = shotCharacters.find((c) => c.id === rel.characterBId);
      if (charA && charB) {
        relationsText += `- ${charA.name} ↔ ${charB.name}：${rel.relationType}${rel.description ? `（${rel.description}）` : ""}\n`;
      }
    }
    relationsText += `
**关系驱动构图规则（最高优先级）**：
- **敌对 / 对立 / 仇人**：两人必须都是**活人角色同屏对峙**——直接对视、肢体对抗、武器对准彼此。禁止把任一方画成背景的雕像/神像/虚影/浮雕。
- **友好 / 盟友**：并肩、相互掩护、眼神交流。
- **爱慕 / 亲密**：靠近、牵手、拥抱、温柔对视。
- **父女 / 师徒**：长辈在前/侧，晚辈在后/侧随从。
- 任何被标记为角色关系的双方，在包含他们的镜头中都必须作为**真实的活人**出现，而不是背景装饰。
`;
  }

  // Fetch world setting and target duration from project
  const [projData] = await db.select({ worldSetting: projects.worldSetting, targetDuration: projects.targetDuration }).from(projects).where(eq(projects.id, projectId));
  let targetDuration = projData?.targetDuration || 0;
  if (episodeId) {
    const [epDur] = await db.select({ targetDuration: episodes.targetDuration }).from(episodes).where(eq(episodes.id, episodeId));
    if (epDur?.targetDuration && epDur.targetDuration > 0) targetDuration = epDur.targetDuration;
  }

  const model = createLanguageModel(modelConfig.text);
  const videoMaxDuration = getModelMaxDuration(modelConfig?.video?.modelId);
  const shotSplitSlots = await resolveSlotContents("shot_split", { userId, projectId });
  const shotSplitDef = getPromptDefinition("shot_split")!;
  const systemPrompt = shotSplitDef.buildFullPrompt(shotSplitSlots, { maxDuration: videoMaxDuration });
  const jsonMode = { openai: { response_format: { type: "json_object" } } };

  // Split screenplay into chunks by SCENE markers (~8 scenes per chunk)
  const fullScript = script || "";
  const sceneChunks = splitScriptByScenes(fullScript, 8);
  // Log scene detection details
  const sceneRe = /^[\s*#]*(?:SCENE|场景)\s*\d+/i;
  const sceneMatches = fullScript.split("\n").filter((l) => sceneRe.test(l.trim()));
  console.log(`[ShotSplit] Detected ${sceneMatches.length} scenes, split into ${sceneChunks.length} chunk(s) of ~8 scenes each`);
  sceneChunks.forEach((c, i) => {
    const sceneCount = c.split("\n").filter((l) => sceneRe.test(l.trim())).length;
    console.log(`[ShotSplit] Chunk ${i + 1}: ${sceneCount} scenes, ${c.length} chars`);
  });

  type ParsedShot = {
    sequence: number;
    sceneDescription: string;
    startFrame: string;
    endFrame: string;
    motionScript: string;
    videoScript?: string;
    duration: number;
    dialogues: Array<{ character: string; text: string }>;
    cameraDirection?: string;
    transitionIn?: string;
    transitionOut?: string;
    compositionGuide?: string;
    focalPoint?: string;
    depthOfField?: string;
    soundDesign?: string;
    musicCue?: string;
    characters?: string[];
    referenceImagePrompts?: string[];
  };

  // Process chunks concurrently
  const chunkResults = await Promise.all(
    sceneChunks.map(async (chunk, idx) => {
      let prompt = buildShotSplitPrompt(chunk, characterDescriptions, characterVisualHints, undefined, characterPerformanceStyles.length > 0 ? characterPerformanceStyles : undefined);

      // Inject character relations (drives on-screen interaction framing)
      if (relationsText) prompt += relationsText;

      // Inject world setting
      if (projData?.worldSetting) {
        prompt = `【世界观设定】\n${projData.worldSetting}\n\n所有镜头必须与此世界观设定保持一致。\n\n` + prompt;
      }

      // Inject target duration
      if (targetDuration && targetDuration > 0) {
        prompt += `\n\n目标总时长：${targetDuration}秒（${Math.floor(targetDuration / 60)}分${targetDuration % 60}秒）。请确保所有镜头的时长之和接近此目标。\n`;
      }
      try {
        const result = await generateText({
          model,
          system: systemPrompt,
          prompt,
          providerOptions: jsonMode,
        });
        const parsed = JSON.parse(extractJSON(result.text));
        // Handle multiple formats:
        // 1. Scene-grouped: [{ sceneTitle, shots: [...] }]
        // 2. Flat with wrapper: { shots: [...] }
        // 3. Flat array: [{ sequence, ... }]
        let shotList: ParsedShot[];
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].shots) {
          // Scene-grouped format — flatten shots and inherit scene description
          shotList = parsed.flatMap((scene: { sceneDescription?: string; shots?: ParsedShot[] }) =>
            (scene.shots || []).map((s) => ({
              ...s,
              sceneDescription: s.sceneDescription || scene.sceneDescription || "",
            }))
          );
        } else if (Array.isArray(parsed)) {
          shotList = parsed;
        } else {
          shotList = parsed.shots || [];
        }
        console.log(`[ShotSplit] Chunk ${idx + 1}/${sceneChunks.length}: ${shotList.length} shots, keys: ${shotList[0] ? Object.keys(shotList[0]).join(",") : "empty"}`);
        return shotList as ParsedShot[];
      } catch (err) {
        console.error(`[ShotSplit] Chunk ${idx + 1} failed:`, err);
        throw new Error(`Shot chunk ${idx + 1} failed`, { cause: err });
      }
    })
  );

  // Merge and re-sequence
  const allShots = chunkResults.flat();
  allShots.forEach((s, i) => { s.sequence = i + 1; });

  if (allShots.length === 0) {
    throw new ApiError(500, "Failed to generate shots");
  }

  // Create version record
  const versionWhereClause = episodeId
    ? and(eq(storyboardVersions.projectId, projectId), eq(storyboardVersions.episodeId, episodeId))
    : eq(storyboardVersions.projectId, projectId);
  const [maxVersionRow] = await db
    .select({ maxNum: storyboardVersions.versionNum })
    .from(storyboardVersions)
    .where(versionWhereClause)
    .orderBy(desc(storyboardVersions.versionNum))
    .limit(1);
  const nextVersionNum = (maxVersionRow?.maxNum ?? 0) + 1;
  const today = new Date();
  const dateStr = today.getUTCFullYear().toString() +
    String(today.getUTCMonth() + 1).padStart(2, "0") +
    String(today.getUTCDate()).padStart(2, "0");
  const versionLabel = `${dateStr}-V${nextVersionNum}`;
  const versionId = genId();
  await db.insert(storyboardVersions).values({
    id: versionId,
    projectId,
    label: versionLabel,
    versionNum: nextVersionNum,
    createdAt: new Date(),
    episodeId: episodeId ?? null,
  });

  for (const shot of allShots) {
    const shotId = genId();
    await db.insert(shots).values({
      id: shotId,
      projectId,
      versionId,
      sequence: shot.sequence,
      prompt: shot.sceneDescription,
      motionScript: shot.motionScript,
      videoScript: shot.videoScript ?? null,
      cameraDirection: shot.cameraDirection || "static",
      duration: shot.duration,
      transitionIn: shot.transitionIn || "cut",
      transitionOut: shot.transitionOut || "cut",
      compositionGuide: shot.compositionGuide || "",
      focalPoint: shot.focalPoint || "",
      depthOfField: shot.depthOfField || "medium",
      soundDesign: shot.soundDesign || "",
      musicCue: shot.musicCue || "",
      episodeId: episodeId ?? null,
    });
    // No automatic asset seeding — shot_assets rows are only created when
    // the user explicitly clicks "生成首尾帧提示词" or "生成参考图提示词".
    // Each generation button writes only its own asset type.

    for (let i = 0; i < (shot.dialogues || []).length; i++) {
      const dialogue = shot.dialogues[i];
      const matchedChar = shotCharacters.find(
        (c: typeof characters.$inferSelect) => c.name === dialogue.character
      );
      if (matchedChar) {
        await db.insert(dialogues).values({
          id: genId(),
          shotId,
          characterId: matchedChar.id,
          text: dialogue.text,
          sequence: i,
        });
      }
    }
  }

  console.log(`[ShotSplit] Created ${allShots.length} shots from ${sceneChunks.length} chunks`);
  return { shots: allShots.length };
}

export function splitScriptByScenes(script: string, maxScenes: number): string[] {
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
    const end = i + maxScenes < boundaries.length
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
  const projectCharacters = await getEpisodeCharacters(projectId, shotEpisodeId);
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
      generateText({ model, prompt, temperature: 0.7 })
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
          shotId, type: "first_frame", sequenceInType: 0,
          prompt: parsed.startFrameDesc, status: "pending",
        });
      }
      const lf = await getActiveAsset(shotId, "last_frame", 0);
      if (lf) {
        await patchAsset(lf.id, { prompt: parsed.endFrameDesc });
      } else {
        await insertAssetVersion({
          shotId, type: "last_frame", sequenceInType: 0,
          prompt: parsed.endFrameDesc, status: "pending",
        });
      }
    }

    return { shotId, status: "ok", ...parsed };
  } catch (err) {
    console.error(`[SingleShotRewrite] Error for shot ${shotId}:`, err);
    throw new ApiError(500, extractErrorMessage(err));
  }
}
