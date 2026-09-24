import { callAgentStream } from "@/lib/ai/agent-caller";
import { createLanguageModel,extractJSON } from "@/lib/ai/ai-sdk";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import { buildScriptGeneratePrompt } from "@/lib/ai/prompts/script-generate";
import { buildScriptParsePrompt } from "@/lib/ai/prompts/script-parse";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { episodes,projects } from "@/lib/db/schema";
import { findBoundAgent } from "@/lib/generation/common";
import type { GenerationInput } from "@/lib/generation/request";
import { streamText } from "ai";
import { eq } from "drizzle-orm";

export async function handleScriptOutlineAction(input: GenerationInput) {
  const { projectId, userId, payload, modelConfig, episodeId } = input;
  const idea = (payload?.idea as string) || "";
  if (!idea.trim()) {
    throw new ApiError(400, "No idea provided");
  }

  // === 智能体路由（流式）===
  const boundAgent = await findBoundAgent(projectId, "script_outline");
  if (boundAgent) {
    try {
      const agentStream = await callAgentStream(
        { platform: boundAgent.platform as "bailian" | "dify" | "coze", appId: boundAgent.appId, apiKey: boundAgent.apiKey },
        `创意构想：${idea}`,
      );
      // TransformStream: accumulate chunks, save to DB in flush (tied to response lifecycle)
      const decoder = new TextDecoder();
      let outlineBuf = "";
      const saveTransform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          outlineBuf += decoder.decode(chunk, { stream: true });
          controller.enqueue(chunk);
        },
        async flush() {
          const outline = outlineBuf.trim();
          if (!outline) return;
          try {
            if (episodeId) {
              await db.update(episodes).set({ outline, updatedAt: new Date() }).where(eq(episodes.id, episodeId));
            } else {
              await db.update(projects).set({ outline, updatedAt: new Date() }).where(eq(projects.id, projectId));
            }
            console.log(`[ScriptOutline Agent] Saved outline (${outline.length} chars)`);
          } catch (err) {
            console.error(`[ScriptOutline Agent] DB save failed:`, err);
          }
        },
      });
      return agentStream.pipeThrough(saveTransform);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Agent script_outline] Error:`, message);
      throw new ApiError(422, message);
    }
  }
  // === 智能体路由结束 ===

  if (!modelConfig?.text) {
    throw new ApiError(400, "No text model configured");
  }

  const model = createLanguageModel(modelConfig.text);
  const outlineSystem = await resolvePrompt("script_outline", { userId, projectId });

  const result = streamText({
    model,
    system: outlineSystem,
    prompt: `创意构想：${idea}`,
    temperature: 0.7,
    onFinish: async ({ text }) => {
      try {
        const outline = text.trim();
        if (episodeId) {
          await db
            .update(episodes)
            .set({ outline, updatedAt: new Date() })
            .where(eq(episodes.id, episodeId));
        } else {
          await db
            .update(projects)
            .set({ outline, updatedAt: new Date() })
            .where(eq(projects.id, projectId));
        }
        console.log(`[ScriptOutline] Saved outline for ${episodeId || projectId}`);
      } catch (err) {
        console.error("[ScriptOutline] onFinish error:", err);
      }
    },
  });

  return result.textStream.pipeThrough(new TextEncoderStream());
}

export async function handleScriptGenerate(input: GenerationInput) {
  const { projectId, userId, payload, modelConfig, episodeId } = input;
  const idea = (payload?.idea as string) || "";
  if (!idea.trim()) {
    throw new ApiError(400, "No idea provided");
  }

  // Save the original idea before generating
  if (episodeId) {
    await db
      .update(episodes)
      .set({ idea, updatedAt: new Date() })
      .where(eq(episodes.id, episodeId));
  } else {
    await db
      .update(projects)
      .set({ idea, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  // === 智能体路由（流式）===
  const sgBoundAgent = await findBoundAgent(projectId, "script_generate");
  if (sgBoundAgent) {
    try {
      const outline = (payload?.outline as string) || "";
      const agentPrompt = outline
        ? `创意构想：${idea}\n\n故事大纲：${outline}`
        : `创意构想：${idea}`;
      const agentStream = await callAgentStream(
        { platform: sgBoundAgent.platform as "bailian" | "dify" | "coze", appId: sgBoundAgent.appId, apiKey: sgBoundAgent.apiKey },
        agentPrompt,
      );
      const sgDecoder = new TextDecoder();
      let scriptBuf = "";
      const sgSaveTransform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          scriptBuf += sgDecoder.decode(chunk, { stream: true });
          controller.enqueue(chunk);
        },
        async flush() {
          const script = scriptBuf.trim();
          if (!script) return;
          try {
            if (episodeId) {
              await db.update(episodes).set({ script, updatedAt: new Date() }).where(eq(episodes.id, episodeId));
            } else {
              await db.update(projects).set({ script, updatedAt: new Date() }).where(eq(projects.id, projectId));
            }
            console.log(`[ScriptGenerate Agent] Saved script (${script.length} chars)`);
          } catch (err) {
            console.error(`[ScriptGenerate Agent] DB save failed:`, err);
          }
        },
      });
      return agentStream.pipeThrough(sgSaveTransform);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Agent script_generate] Error:`, message);
      throw new ApiError(422, message);
    }
  }
  // === 智能体路由结束 ===

  if (!modelConfig?.text) {
    throw new ApiError(400, "No text model configured");
  }

  // Use outline from payload (latest from UI) or fallback to DB
  let outline = (payload?.outline as string) || "";
  if (!outline) {
    if (episodeId) {
      const [ep] = await db.select({ outline: episodes.outline }).from(episodes).where(eq(episodes.id, episodeId));
      outline = ep?.outline || "";
    } else {
      const [proj] = await db.select({ outline: projects.outline }).from(projects).where(eq(projects.id, projectId));
      outline = proj?.outline || "";
    }
  }

  const outlineContext = outline
    ? `\n\n【故事大纲 - 请严格按照以下大纲结构展开剧本】\n${outline}\n\n`
    : "";

  // Fetch world setting from project
  let worldSettingContext = "";
  const [projForWorld] = await db.select({ worldSetting: projects.worldSetting }).from(projects).where(eq(projects.id, projectId));
  if (projForWorld?.worldSetting) {
    worldSettingContext = `\n\n【世界观设定】\n${projForWorld.worldSetting}\n\n剧本必须与此世界观设定保持一致。\n\n`;
  }

  const model = createLanguageModel(modelConfig.text);
  const scriptGenerateSystem = await resolvePrompt("script_generate", { userId, projectId });

  const result = streamText({
    model,
    system: scriptGenerateSystem,
    prompt: worldSettingContext + outlineContext + buildScriptGeneratePrompt(idea),
    temperature: 0.8,
    onFinish: async ({ text }) => {
      try {
        if (episodeId) {
          await db
            .update(episodes)
            .set({ script: text, updatedAt: new Date() })
            .where(eq(episodes.id, episodeId));
        } else {
          await db
            .update(projects)
            .set({ script: text, updatedAt: new Date() })
            .where(eq(projects.id, projectId));
        }
        console.log(`[ScriptGenerate] Saved generated script for ${episodeId || projectId}`);
      } catch (err) {
        console.error("[ScriptGenerate] onFinish error:", err);
      }
    },
  });

  return result.textStream.pipeThrough(new TextEncoderStream());
}

export async function handleScriptParseStream(input: GenerationInput) {
  const { projectId, userId, modelConfig, episodeId } = input;
  let script: string | null = null;

  if (episodeId) {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    script = episode?.script ?? null;
  } else {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    script = project?.script ?? null;
  }

  if (!script) {
    throw new ApiError(404, "Project or script not found");
  }

    // === 智能体路由（流式）===
  const boundAgent = await findBoundAgent(projectId, "script_parse");
  if (boundAgent) {
    try {
      const agentStream = await callAgentStream(
        { platform: boundAgent.platform as "bailian" | "dify" | "coze", appId: boundAgent.appId, apiKey: boundAgent.apiKey },
        script,
      );
      const spSaveTransform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) { controller.enqueue(chunk); },
        async flush() {
          try {
            if (episodeId) {
              await db.update(episodes).set({ updatedAt: new Date() }).where(eq(episodes.id, episodeId));
            } else {
              await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
            }
            console.log(`[ScriptParse Agent] Updated timestamp`);
          } catch (err) {
            console.error(`[ScriptParse Agent] DB update failed:`, err);
          }
        },
      });
      return agentStream.pipeThrough(spSaveTransform);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Agent script_parse] Error:`, message);
      throw new ApiError(422, message);
    }
  }
  // === 智能体路由结束 ===

  if (!modelConfig?.text) {
    throw new ApiError(400, "No text model configured");
  }

  const model = createLanguageModel(modelConfig.text);
  const scriptParseSystem = await resolvePrompt("script_parse", { userId, projectId });

  const result = streamText({
    model,
    system: scriptParseSystem,
    prompt: buildScriptParsePrompt(script),
    temperature: 0.7,
    onFinish: async ({ text }) => {
      try {
        const screenplay = extractJSON(text);
        JSON.parse(screenplay); // validate JSON
        if (episodeId) {
          await db.update(episodes).set({ updatedAt: new Date() }).where(eq(episodes.id, episodeId));
        } else {
          await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
        }
        console.log(`[ScriptParse] Parsed screenplay for ${episodeId || projectId}`);
      } catch (err) {
        console.error("[ScriptParse] onFinish error:", err);
      }
    },
  });

  return result.textStream.pipeThrough(new TextEncoderStream());
}
