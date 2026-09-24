import { callAgent, type AgentCategory } from "@/lib/ai/agent-caller";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import {
  agentBindings,
  agents,
  characters,
  episodeCharacters,
  storyboardVersions,
} from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import path from "path";

export async function callProjectAgent(
  agent: { platform: string; appId: string; apiKey: string },
  category: AgentCategory,
  prompt: string,
): Promise<{ text: string }> {
  try {
    const rawText = await callAgent(
      {
        platform: agent.platform as "bailian" | "dify" | "coze",
        appId: agent.appId,
        apiKey: agent.apiKey,
      },
      prompt,
    );
    return { text: rawText };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Agent ${category}] Error:`, message);
    throw new ApiError(422, message);
  }
}

export function ratioToImageOpts(ratio?: string): {
  aspectRatio?: string;
  size?: string;
} {
  switch (ratio) {
    case "16:9":
      return { aspectRatio: "16:9", size: "2560x1440" };
    case "9:16":
      return { aspectRatio: "9:16", size: "1440x2560" };
    case "1:1":
      return { aspectRatio: "1:1", size: "2048x2048" };
    default:
      return { aspectRatio: "16:9", size: "2560x1440" };
  }
}

export async function getEpisodeCharacters(
  projectId: string,
  epId?: string | null,
) {
  if (epId) {
    const linkedIds = await db
      .select({ characterId: episodeCharacters.characterId })
      .from(episodeCharacters)
      .where(eq(episodeCharacters.episodeId, epId));
    if (linkedIds.length > 0) {
      return db
        .select()
        .from(characters)
        .where(
          inArray(
            characters.id,
            linkedIds.map((r) => r.characterId),
          ),
        );
    }
    return [] as (typeof characters.$inferSelect)[];
  }
  return db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId));
}

export function isCharacterOnScreen(
  characterName: string,
  videoScript: string,
  startFrameDesc: string | null | undefined,
): boolean {
  const text = `${videoScript} ${startFrameDesc ?? ""}`;
  return text.includes(characterName);
}

export function buildCharMappingPrefix(
  chars: Array<typeof characters.$inferSelect>,
): string {
  if (chars.length === 0) return "";
  const charMapping = chars.map((c, i) => `图片${i + 1}=${c.name}`).join("，");
  const charDescriptions = chars
    .map((c) => {
      const heightInfo = c.heightCm ? `身高约${c.heightCm}cm` : "";
      const bodyInfo = c.bodyType ? `${c.bodyType}体型` : "";
      const physicalTags = [heightInfo, bodyInfo].filter(Boolean).join("，");
      return `${c.name}${physicalTags ? `（${physicalTags}）` : ""}: ${c.description || ""}`;
    })
    .join("\n");
  const heightHint =
    chars.length > 1
      ? `\n\n【角色比例严格要求】画面中角色的相对身高/体型必须严格遵循上述身高数据。儿童必须明显小于成人，体型矮小、头身比例符合实际年龄，绝不可画成与成人同等大小。`
      : "";
  return `角色映射：${charMapping}\n\n角色描述：\n${charDescriptions}${heightHint}\n\n严格按照参考图的角色外观（面部、服装、发型）和相对比例生成。\n\n场景描述：`;
}

export async function getVersionedUploadDir(
  versionId: string | null | undefined,
): Promise<string> {
  if (!versionId) return process.env.UPLOAD_DIR || "./uploads";
  const [version] = await db
    .select({
      label: storyboardVersions.label,
      projectId: storyboardVersions.projectId,
    })
    .from(storyboardVersions)
    .where(eq(storyboardVersions.id, versionId));
  if (!version) return process.env.UPLOAD_DIR || "./uploads";
  return path.join(
    process.env.UPLOAD_DIR || "./uploads",
    "projects",
    version.projectId,
    versionId,
  );
}

export function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // Try to parse JSON error bodies (e.g. Google GenAI ApiError)
  try {
    const parsed = JSON.parse(err.message) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {}
  return err.message;
}

export async function findBoundAgent(
  projectId: string,
  category: AgentCategory,
) {
  const [binding] = await db
    .select({ agentId: agentBindings.agentId })
    .from(agentBindings)
    .where(
      and(
        eq(agentBindings.projectId, projectId),
        eq(agentBindings.category, category),
      ),
    );
  if (!binding?.agentId) {
    console.log(
      `[findBoundAgent] ${category}: no binding for project ${projectId}`,
    );
    return null;
  }
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, binding.agentId));
  console.log(
    `[findBoundAgent] ${category}: found agent "${agent?.name}" (platform=${agent?.platform}, appId=${agent?.appId?.slice(0, 10)}...)`,
  );
  return agent ?? null;
}
