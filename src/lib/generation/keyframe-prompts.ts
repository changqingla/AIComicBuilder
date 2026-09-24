import { extractJSON } from "@/lib/ai/ai-sdk";
import { buildKeyframePromptsRequest } from "@/lib/ai/prompts/keyframe-prompts";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import { resolveAIProvider } from "@/lib/ai/provider-factory";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { characterRelations,episodes,projects,shots } from "@/lib/db/schema";
import { callAndValidateAgent,findBoundAgent,getEpisodeCharacters } from "@/lib/generation/common";
import type { GenerationInput } from "@/lib/generation/request";
import { insertAssetVersion } from "@/lib/shot-asset-utils";
import { and,asc,eq } from "drizzle-orm";

export async function handleGenerateKeyframePrompts(input: GenerationInput) {
  const { projectId, userId, payload, modelConfig, episodeId } = input;
  // === 智能体路由 ===
  const kpBoundAgent = await findBoundAgent(projectId, "keyframe_prompts");
  if (kpBoundAgent) {
    // Build prompt from shots data (same info as built-in pipeline)
    const batchVersionId = payload?.versionId as string | undefined;
    const kpWhereConds = [eq(shots.projectId, projectId)];
    if (batchVersionId) kpWhereConds.push(eq(shots.versionId, batchVersionId));
    if (episodeId) kpWhereConds.push(eq(shots.episodeId, episodeId));
    const kpAgentShots = await db.select().from(shots).where(and(...kpWhereConds)).orderBy(asc(shots.sequence));
    if (kpAgentShots.length === 0) {
      throw new ApiError(400, "没有分镜数据，请先生成分镜");
    }
    const kpAgentChars = await getEpisodeCharacters(projectId, episodeId);
    const kpPrompt = JSON.stringify({
      shots: kpAgentShots.map((s) => ({
        sequence: s.sequence,
        sceneDescription: s.prompt,
        motionScript: s.motionScript,
        cameraDirection: s.cameraDirection,
        duration: s.duration,
      })),
      characters: kpAgentChars.map((c) => ({ name: c.name, description: c.description, visualHint: c.visualHint })),
    }, null, 2);

    const agentResult = await callAndValidateAgent(kpBoundAgent, "keyframe_prompts", kpPrompt);

    // Parse agent output — must be JSON array
    try {
      const kpParsed = JSON.parse(extractJSON(agentResult.text)) as Array<Record<string, unknown>>;
      if (!Array.isArray(kpParsed)) {
        throw new ApiError(422, "智能体必须返回 JSON 数组格式的首尾帧提示词");
      }

      let savedCount = 0;
      for (const entry of kpParsed) {
        const seq = (entry.sequence as number) ?? (entry.shotSequence as number) ?? 0;
        const shot = kpAgentShots.find((s) => s.sequence === seq);
        if (!shot) continue;

        const startFrame = (entry.startFrame || (entry.prompts as string[])?.[0] || "") as string;
        const endFrame = (entry.endFrame || (entry.prompts as string[])?.[1] || "") as string;
        const chars = Array.isArray(entry.characters) ? entry.characters as string[] : [];

        if (startFrame) {
          await insertAssetVersion({ shotId: shot.id, type: "first_frame", sequenceInType: 0, prompt: startFrame, status: "pending", characters: chars });
          savedCount++;
        }
        if (endFrame) {
          await insertAssetVersion({ shotId: shot.id, type: "last_frame", sequenceInType: 0, prompt: endFrame, status: "pending", characters: chars });
          savedCount++;
        }
      }
      console.log(`[KeyframePrompts Agent] Saved ${savedCount} assets from ${kpParsed.length} shots`);
      return { updatedCount: kpParsed.length, totalShots: kpAgentShots.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiError(422, `智能体首尾帧提示词解析失败: ${msg}`);
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

  if (allShots.length === 0 && batchVersionId) {
    console.warn(`[GenerateKeyframePrompts] strict filter empty (versionId=${batchVersionId}), falling back to no-version filter`);
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

  // Pull visual style meta from script (same regex as ref prompts handler)
  const scriptSource = episodeId
    ? await db.select({ script: episodes.script }).from(episodes).where(eq(episodes.id, episodeId))
    : await db.select({ script: projects.script }).from(projects).where(eq(projects.id, projectId));
  const script = scriptSource[0]?.script || "";

  const pickField = (label: string): string => {
    const re = new RegExp(`${label}[：:]\\s*(.+?)(?:\\n|$)`);
    const m = script.match(re);
    return m?.[1]?.trim() || "";
  };
  const visualStyle = [
    pickField("视觉风格") || pickField("Visual Style"),
    pickField("色彩基调") && `色彩基调：${pickField("色彩基调")}`,
    pickField("时代美学") && `时代美学：${pickField("时代美学")}`,
    pickField("氛围情绪") && `氛围情绪：${pickField("氛围情绪")}`,
    pickField("画幅比例") && `画幅比例：${pickField("画幅比例")}`,
  ].filter(Boolean).join("；");

  // Load character relationships — drives on-screen interaction framing.
  // Enemies must face each other as live combatants, not background icons.
  const kfRelations = await db
    .select()
    .from(characterRelations)
    .where(eq(characterRelations.projectId, projectId));
  let kfRelationsText = "";
  if (kfRelations.length > 0) {
    kfRelationsText = "\n\n## 角色关系（必须用于决定站位、眼神、肢体对抗、画面张力）\n";
    for (const rel of kfRelations) {
      const charA = projectCharacters.find((c) => c.id === rel.characterAId);
      const charB = projectCharacters.find((c) => c.id === rel.characterBId);
      if (charA && charB) {
        kfRelationsText += `- ${charA.name} ↔ ${charB.name}：${rel.relationType}${rel.description ? `（${rel.description}）` : ""}\n`;
      }
    }
    kfRelationsText += `
**关系驱动构图规则（最高优先级）**：
- **敌对 / 对立 / 仇人**：两人必须都是**活人角色同屏对峙**，直接对视、肢体对抗、武器对准彼此。严禁把任一方画成背景的雕像/神像/虚影/浮雕/壁画。
- **友好 / 盟友**：并肩站位、相互掩护、眼神交流。
- **爱慕 / 亲密**：靠近、牵手、拥抱、温柔对视。
- **父女 / 师徒**：长辈在前或侧，晚辈跟随。
- 凡是出现在 characters 列表里的角色，在首尾帧画面里都必须是真实的活人，不允许以雕像/虚影形式出场。
`;
  }

  const textProvider = resolveAIProvider(modelConfig);
  const keyframeSystemPrompt = await resolvePrompt("shot_split_keyframe_assets", {
    userId,
    projectId,
  });

  // Concurrent per-shot generation: each shot is one LLM call, all run in parallel.
  const total = allShots.length;
  let doneCount = 0;
  console.log(`[GenerateKeyframePrompts] Starting concurrent generation: 0/${total}`);
  const results = await Promise.allSettled(
    allShots.map(async (shot) => {
      try {
        const basePromptRequest = buildKeyframePromptsRequest(
          [{
            sequence: shot.sequence,
            prompt: shot.prompt || "",
            motionScript: shot.motionScript,
            cameraDirection: shot.cameraDirection,
          }],
          projectCharacters.map((c) => ({
            name: c.name,
            description: c.description,
            visualHint: c.visualHint,
          })),
          visualStyle
        );
        const promptRequest = kfRelationsText
          ? basePromptRequest + kfRelationsText
          : basePromptRequest;

        const result = await textProvider.generateText(promptRequest, {
          systemPrompt: keyframeSystemPrompt,
          temperature: 0.5,
        });

        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error(`Shot ${shot.sequence}: invalid JSON response`);
        }
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          shotSequence: number;
          characters?: string[];
          prompts: string[];
        }>;
        const entry = parsed.find((e) => e.shotSequence === shot.sequence) || parsed[0];
        if (!entry || !Array.isArray(entry.prompts) || entry.prompts.length < 2) {
          throw new Error(`Shot ${shot.sequence}: expected 2 prompts (first/last frame)`);
        }

        // Use LLM-provided per-shot character list (only visible chars in this shot).
        // Fall back to empty array if LLM omitted the field — never default to all chars.
        const charsForShot = Array.isArray(entry.characters) ? entry.characters : [];
        await insertAssetVersion({
          shotId: shot.id,
          type: "first_frame",
          sequenceInType: 0,
          prompt: entry.prompts[0],
          status: "pending",
          characters: charsForShot,
        });
        await insertAssetVersion({
          shotId: shot.id,
          type: "last_frame",
          sequenceInType: 0,
          prompt: entry.prompts[1],
          status: "pending",
          characters: charsForShot,
        });
        doneCount++;
        console.log(`[GenerateKeyframePrompts] ✓ shot ${shot.sequence} (${doneCount}/${total})`);
        return shot.sequence;
      } catch (err) {
        doneCount++;
        console.warn(`[GenerateKeyframePrompts] ✗ shot ${shot.sequence} (${doneCount}/${total}): ${String(err)}`);
        throw err;
      }
    })
  );

  const updatedCount = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .map((r, i) => (r.status === "rejected" ? { seq: allShots[i].sequence, err: String(r.reason) } : null))
    .filter(Boolean);
  if (failed.length > 0) {
    console.warn(`[GenerateKeyframePrompts] ${failed.length} shots failed:`, failed);
  }
  console.log(`[GenerateKeyframePrompts] Updated ${updatedCount}/${allShots.length} shots (concurrent)`);
  return { updatedCount, totalShots: allShots.length };
}
