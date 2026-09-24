import { z } from "zod";
import { streamText } from "ai";
import { eq } from "drizzle-orm";
import { callAgentStream, type AgentPlatform } from "@/lib/ai/agent-caller";
import { createLanguageModel, extractJSON } from "@/lib/ai/ai-sdk";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import { buildScriptGeneratePrompt } from "@/lib/ai/prompts/script-generate";
import { buildScriptParsePrompt } from "@/lib/ai/prompts/script-parse";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { episodes, projects } from "@/lib/db/schema";
import { findBoundAgent } from "./common";
import type { GenerationInput } from "./request";

type ScriptAction = "script_outline" | "script_generate" | "script_parse";
const screenplaySchema = z.object({
  title: z.string(),
  synopsis: z.string(),
  scenes: z
    .array(
      z.object({
        sceneNumber: z.number(),
        setting: z.string(),
        description: z.string(),
      }),
    )
    .min(1),
});

function readSource(input: GenerationInput) {
  return input.episodeId
    ? db.select().from(episodes).where(eq(episodes.id, input.episodeId)).get()
    : db.select().from(projects).where(eq(projects.id, input.projectId)).get();
}

function saveSource(
  input: GenerationInput,
  patch: { idea?: string; outline?: string; script?: string },
) {
  const update = { ...patch, updatedAt: new Date() };
  if (input.episodeId)
    db.update(episodes)
      .set(update)
      .where(eq(episodes.id, input.episodeId))
      .run();
  else
    db.update(projects)
      .set(update)
      .where(eq(projects.id, input.projectId))
      .run();
}

async function generateScriptText(
  input: GenerationInput,
  action: ScriptAction,
  prompt: string,
  save: (text: string) => void,
) {
  const agent = await findBoundAgent(input.projectId, action);
  if (!agent && !input.modelConfig?.text)
    throw new ApiError(400, "No text model configured");
  const system = await resolvePrompt(action, input);
  const stream = agent
    ? await callAgentStream(
        { ...agent, platform: agent.platform as AgentPlatform },
        `${system}\n\n${prompt}`,
      )
    : streamText({
        model: createLanguageModel(input.modelConfig!.text!),
        system,
        prompt,
        temperature: 0.7,
      }).textStream.pipeThrough(new TextEncoderStream());
  let result = "";
  const decoder = new TextDecoder();
  // Saving is part of consuming the stream. An interrupted stream never replaces the saved text.
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        result += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      flush() {
        result += decoder.decode();
        if (!result.trim()) throw new Error("The model returned empty text");
        save(result.trim());
      },
    }),
  );
}

export async function handleScriptOutlineAction(input: GenerationInput) {
  const idea =
    typeof input.payload?.idea === "string" ? input.payload.idea.trim() : "";
  if (!idea) throw new ApiError(400, "No idea provided");
  return generateScriptText(
    input,
    "script_outline",
    `创意构想：${idea}`,
    (outline) => saveSource(input, { outline }),
  );
}

export async function handleScriptGenerate(input: GenerationInput) {
  const idea =
    typeof input.payload?.idea === "string" ? input.payload.idea.trim() : "";
  if (!idea) throw new ApiError(400, "No idea provided");
  const outline =
    typeof input.payload?.outline === "string"
      ? input.payload.outline
      : readSource(input)?.outline;
  const project = db
    .select({ worldSetting: projects.worldSetting })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .get();
  const prompt = [
    project?.worldSetting
      ? `【世界观设定】\n${project.worldSetting}\n剧本必须与此世界观设定保持一致。`
      : "",
    outline ? `【故事大纲】\n${outline}\n请严格按照大纲结构展开剧本。` : "",
    buildScriptGeneratePrompt(idea),
  ]
    .filter(Boolean)
    .join("\n\n");
  return generateScriptText(input, "script_generate", prompt, (script) =>
    saveSource(input, { idea, script }),
  );
}

export async function handleScriptParseStream(input: GenerationInput) {
  const script = readSource(input)?.script;
  if (!script) throw new ApiError(404, "Script not found");
  return generateScriptText(
    input,
    "script_parse",
    buildScriptParsePrompt(script),
    (text) => {
      screenplaySchema.parse(JSON.parse(extractJSON(text)));
      saveSource(input, {});
    },
  );
}
