import { extractJSON } from "@/lib/ai/ai-sdk";
import { buildRefImagePromptsRequest } from "@/lib/ai/prompts/ref-image-prompts";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import { resolveAIProvider } from "@/lib/ai/provider-factory";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { characterRelations,episodes,projects,shots } from "@/lib/db/schema";
import { callAndValidateAgent,findBoundAgent,getEpisodeCharacters } from "@/lib/generation/common";
import type { GenerationInput } from "@/lib/generation/request";
import { insertAssetVersion } from "@/lib/shot-asset-utils";
import { and,asc,eq } from "drizzle-orm";

export async function handleGenerateRefPrompts(input: GenerationInput) {
  const { projectId, userId, payload, modelConfig, episodeId } = input;
  // === 智能体路由 ===
  const refBoundAgent = await findBoundAgent(projectId, "ref_image_prompts");
  if (refBoundAgent) {
    const refVersionId = payload?.versionId as string | undefined;
    const refWhereConds = [eq(shots.projectId, projectId)];
    if (refVersionId) refWhereConds.push(eq(shots.versionId, refVersionId));
    if (episodeId) refWhereConds.push(eq(shots.episodeId, episodeId));
    const refAgentShots = await db.select().from(shots).where(and(...refWhereConds)).orderBy(asc(shots.sequence));
    if (refAgentShots.length === 0) {
      throw new ApiError(400, "没有分镜数据，请先生成分镜");
    }
    const refAgentChars = await getEpisodeCharacters(projectId, episodeId);
    const refPrompt = JSON.stringify({
      shots: refAgentShots.map((s) => ({
        sequence: s.sequence,
        sceneDescription: s.prompt,
        motionScript: s.motionScript,
        cameraDirection: s.cameraDirection,
        duration: s.duration,
      })),
      characters: refAgentChars.map((c) => ({ name: c.name, description: c.description, visualHint: c.visualHint })),
    }, null, 2);

    const agentResult = await callAndValidateAgent(refBoundAgent, "ref_image_prompts", refPrompt);

    try {
      const refParsed = JSON.parse(extractJSON(agentResult.text)) as Array<Record<string, unknown>>;
      if (!Array.isArray(refParsed)) {
        throw new ApiError(422, "智能体必须返回 JSON 数组格式的参考图提示词");
      }

      let savedCount = 0;
      console.log(`[RefImagePrompts Agent] Parsed ${refParsed.length} entries, keys: ${refParsed[0] ? Object.keys(refParsed[0]).join(",") : "empty"}`);
      for (const entry of refParsed) {
        const seq = (entry.sequence as number) ?? (entry.shotSequence as number) ?? 0;
        const shot = refAgentShots.find((s) => s.sequence === seq);
        if (!shot) { console.log(`[RefImagePrompts Agent] No shot found for seq=${seq}`); continue; }

        const scenes = (entry.scenes || entry.prompts || []) as Array<Record<string, unknown>>;
        const chars = Array.isArray(entry.characters) ? entry.characters as string[] : [];
        console.log(`[RefImagePrompts Agent] seq=${seq}, scenes=${scenes.length}, chars=${chars.length}`);

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          const prompt = (scene.prompt || scene as unknown as string || "") as string;
          const name = (scene.name || `scene_${i}`) as string;
          if (prompt && typeof prompt === "string") {
            await insertAssetVersion({
              shotId: shot.id,
              type: "reference",
              sequenceInType: i,
              prompt,
              status: "pending",
              characters: chars,
              meta: { sceneName: name },
            });
            savedCount++;
          }
        }
      }
      console.log(`[RefImagePrompts Agent] Saved ${savedCount} reference prompts`);
      return { updatedCount: refParsed.length, totalShots: refAgentShots.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiError(422, `智能体参考图提示词解析失败: ${msg}`);
    }
  }
  // === 智能体路由结束 ===

  if (!modelConfig?.text) {
    throw new ApiError(400, "No text model configured");
  }

  const batchVersionId = payload?.versionId as string | undefined;
  const buildWhere = (includeVersion: boolean) => {
    const conds = [eq(shots.projectId, projectId)];
    if (includeVersion && batchVersionId) conds.push(eq(shots.versionId, batchVersionId));
    if (episodeId) conds.push(eq(shots.episodeId, episodeId));
    return and(...conds);
  };

  let allShots = await db
    .select()
    .from(shots)
    .where(buildWhere(true))
    .orderBy(asc(shots.sequence));

  // Fallback: if the strict version filter returns empty (e.g. stale
  // selectedVersionId on the client), retry without version — use the
  // shots that actually exist for this project+episode.
  if (allShots.length === 0 && batchVersionId) {
    console.warn(`[GenerateRefPrompts] strict filter empty (versionId=${batchVersionId}), falling back to no-version filter`);
    allShots = await db
      .select()
      .from(shots)
      .where(buildWhere(false))
      .orderBy(asc(shots.sequence));
  }

  if (allShots.length === 0) {
    throw new ApiError(400, "No shots found");
  }

  const projectCharacters = await getEpisodeCharacters(projectId, episodeId);

  // Get visual style from script — parse the fixed machine-readable meta block
  // (see src/lib/ai/prompts/script-generate.ts VISUAL STYLE section)
  const scriptSource = episodeId
    ? await db.select({ script: episodes.script }).from(episodes).where(eq(episodes.id, episodeId))
    : await db.select({ script: projects.script }).from(projects).where(eq(projects.id, projectId));
  const script = scriptSource[0]?.script || "";

  const pickField = (label: string): string => {
    const re = new RegExp(`${label}[：:]\\s*(.+?)(?:\\n|$)`);
    const m = script.match(re);
    return m?.[1]?.trim() || "";
  };
  const metaVisualStyle = pickField("视觉风格") || pickField("Visual Style");
  const metaColorTone = pickField("色彩基调");
  const metaEra = pickField("时代美学");
  const metaMood = pickField("氛围情绪");
  const metaRatio = pickField("画幅比例");
  // 参考导演 is intentionally NOT injected into visualStyle anymore —
  // it carries real person names that trigger content filters at both
  // the text LLM (400) and the image API (400 invalid_request_error).

  const visualStyle = [
    metaVisualStyle,
    metaColorTone && `色彩基调：${metaColorTone}`,
    metaEra && `时代美学：${metaEra}`,
    metaMood && `氛围情绪：${metaMood}`,
    metaRatio && `画幅比例：${metaRatio}`,
  ].filter(Boolean).join("；");

  // Load character relationships — drives on-screen interaction framing
  // when scene frames plan out the space for enemies / allies.
  const refRelations = await db
    .select()
    .from(characterRelations)
    .where(eq(characterRelations.projectId, projectId));
  let refRelationsText = "";
  if (refRelations.length > 0) {
    refRelationsText = "\n\n## 角色关系（必须用于决定场景空间规划）\n";
    for (const rel of refRelations) {
      const charA = projectCharacters.find((c) => c.id === rel.characterAId);
      const charB = projectCharacters.find((c) => c.id === rel.characterBId);
      if (charA && charB) {
        refRelationsText += `- ${charA.name} ↔ ${charB.name}：${rel.relationType}${rel.description ? `（${rel.description}）` : ""}\n`;
      }
    }
    refRelationsText += `
**关系驱动场景规划规则**：
- **敌对**：场景需要有明确的对峙空间轴线——两个站位点之间留出视觉通道。
- **友好/父女/师徒**：场景留出并肩站位的空间。
- 这些只影响场景帧的空间布局（景别/构图/空间轴线），场景帧本身**仍然不画任何人物**。
`;
  }

  const textProvider = resolveAIProvider(modelConfig);
  const refImageSystem = await resolvePrompt("ref_image_prompts", { userId, projectId });
  const { deleteAssetsByType } = await import("@/lib/shot-asset-utils");

  // Batch generation strategy — each LLM call receives a chunk of 8
  // consecutive shots so the AI can maintain narrative continuity across
  // them (lighting evolution, spatial flow, prop reuse). Batches run
  // SEQUENTIALLY so each batch can see the previous batch's last shot as
  // continuity context. Concurrent per-shot calls broke story coherence —
  // each shot got a near-duplicate "intro scene" from the LLM.
  const total = allShots.length;
  const BATCH_SIZE = 8;
  const batches: typeof allShots[] = [];
  for (let i = 0; i < allShots.length; i += BATCH_SIZE) {
    batches.push(allShots.slice(i, i + BATCH_SIZE));
  }
  console.log(`[GenerateRefPrompts] Starting sequential batched generation: ${batches.length} batch(es) of up to ${BATCH_SIZE} shots, total ${total}`);

  let updatedCount = 0;
  const failed: Array<{ seq: number; err: string }> = [];
  let previousBatchTail: { sequence: number; sceneName?: string; prompt: string } | null = null;

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const batchStart = Date.now();
    try {
      const baseRefRequest = buildRefImagePromptsRequest(
        batch.map((s) => ({
          sequence: s.sequence,
          prompt: s.prompt || "",
          motionScript: s.motionScript,
          cameraDirection: s.cameraDirection,
          duration: s.duration,
        })),
        projectCharacters.map((c) => ({ name: c.name, description: c.description })),
        visualStyle
      );

      let promptRequest = refRelationsText
        ? baseRefRequest + refRelationsText
        : baseRefRequest;

      // Continuity context from the last shot of the previous batch.
      if (previousBatchTail) {
        promptRequest += `\n\n## 剧情连续性上下文\n本批次的镜头 ${batch[0].sequence} 紧接上一批次镜头 ${previousBatchTail.sequence} 之后。上一个镜头的结束场景是"${previousBatchTail.sceneName || "未命名"}"：${previousBatchTail.prompt.slice(0, 160)}...\n请让本批次第一个镜头的场景在空间/光线/色调上与之自然衔接，避免突兀重置到"起始场景"风格。`;
      }

      const result = await textProvider.generateText(promptRequest, {
        systemPrompt: refImageSystem,
        temperature: 0.7,
      });

      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error(`Batch ${bi + 1}: invalid JSON response`);
      }
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        shotSequence: number;
        characters?: string[];
        scenes?: Array<{ name: string; prompt: string }>;
        prompts?: string[]; // legacy shape
      }>;

      let batchUpdated = 0;
      let lastEntryForContinuity: { sequence: number; sceneName?: string; prompt: string } | null = null;
      for (const shot of batch) {
        try {
          const entry = parsed.find((e) => e.shotSequence === shot.sequence);
          if (!entry) {
            console.warn(`[GenerateRefPrompts] batch ${bi + 1}: shot ${shot.sequence} missing from LLM output`);
            failed.push({ seq: shot.sequence, err: "missing from batch output" });
            continue;
          }

          // Normalize: accept new { scenes: [{name, prompt}] } or legacy
          // { prompts: [string] } format.
          let sceneList: Array<{ name: string; prompt: string }> = [];
          if (Array.isArray(entry.scenes) && entry.scenes.length > 0) {
            sceneList = entry.scenes.filter((s) => s && typeof s.prompt === "string" && s.prompt.trim());
          } else if (Array.isArray(entry.prompts) && entry.prompts.length > 0) {
            sceneList = entry.prompts.map((p, i) => ({ name: `场景 ${i + 1}`, prompt: p }));
          }
          if (sceneList.length === 0) {
            failed.push({ seq: shot.sequence, err: "empty scenes/prompts" });
            continue;
          }

          const shotCharacters = Array.isArray(entry.characters) ? entry.characters : [];
          if (shotCharacters.length === 0) {
            console.warn(`[GenerateRefPrompts] Shot ${shot.sequence}: AI did not emit 'characters' field`);
          }
          await deleteAssetsByType(shot.id, "reference");
          for (let pi = 0; pi < sceneList.length; pi++) {
            const scene = sceneList[pi];
            await insertAssetVersion({
              shotId: shot.id,
              type: "reference",
              sequenceInType: pi,
              prompt: scene.prompt,
              status: "pending",
              characters: shotCharacters,
              meta: { sceneName: scene.name || `场景 ${pi + 1}` },
            });
          }
          updatedCount++;
          batchUpdated++;
          // Track the last successfully parsed shot in this batch — fed
          // into the next batch as continuity context.
          const lastScene = sceneList[sceneList.length - 1];
          lastEntryForContinuity = {
            sequence: shot.sequence,
            sceneName: lastScene.name,
            prompt: lastScene.prompt,
          };
        } catch (shotErr) {
          failed.push({ seq: shot.sequence, err: String(shotErr) });
        }
      }
      if (lastEntryForContinuity) previousBatchTail = lastEntryForContinuity;
      const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
      console.log(`[GenerateRefPrompts] ✓ batch ${bi + 1}/${batches.length} (${batch[0].sequence}..${batch[batch.length - 1].sequence}): ${batchUpdated}/${batch.length} shots in ${elapsed}s`);
    } catch (err) {
      const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
      console.warn(`[GenerateRefPrompts] ✗ batch ${bi + 1}/${batches.length} failed in ${elapsed}s: ${String(err)}`);
      for (const shot of batch) failed.push({ seq: shot.sequence, err: String(err) });
    }
  }

  if (failed.length > 0) {
    console.warn(`[GenerateRefPrompts] ${failed.length} shots failed:`, failed);
  }
  console.log(`[GenerateRefPrompts] Updated ${updatedCount}/${total} shots (sequential batched)`);
  return { updatedCount, totalShots: total };
}
