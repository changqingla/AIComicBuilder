import { EventSourceParserStream } from "eventsource-parser/stream";

// src/lib/ai/agent-caller.ts
// Multi-platform agent caller: Bailian, Dify, Coze

export type AgentPlatform = "bailian" | "dify" | "coze";

interface AgentConfig {
  platform: AgentPlatform;
  appId: string;
  apiKey: string;
}

// ── Unified streaming caller ────────────────────────────────────────
// Returns a ReadableStream of text chunks (decoded). Throws on error.
export async function callAgentStream(
  config: AgentConfig,
  prompt: string,
): Promise<ReadableStream<Uint8Array>> {
  switch (config.platform) {
    case "bailian":
      return callBailianAgentStream(config, prompt);
    case "dify":
      return callDifyAgentStream(config, prompt);
    case "coze":
      // Coze workflow doesn't have native SSE for run_workflow — fall back to full text
      const text = await callCozeAgent(config, prompt);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    default:
      throw new Error(`不支持的智能体平台: ${config.platform}`);
  }
}

async function callBailianAgentStream(
  config: { appId: string; apiKey: string },
  prompt: string,
): Promise<ReadableStream<Uint8Array>> {
  const url = `https://dashscope.aliyuncs.com/api/v1/apps/${config.appId}/completion`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "X-DashScope-SSE": "enable",
    },
    body: JSON.stringify({
      input: { prompt },
      parameters: { incremental_output: true },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `百炼智能体请求失败: ${res.status} ${errText.slice(0, 300)}`,
    );
  }
  if (!res.body) throw new Error("百炼智能体返回为空");

  const encoder = new TextEncoder();
  return res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(
      new TransformStream({
        transform(message, controller) {
          const event = JSON.parse(message.data) as BailianResponse;
          if (event.code)
            throw new Error(
              `百炼智能体错误 [${event.code}]: ${event.message ?? "unknown"}`,
            );
          if (event.output?.text)
            controller.enqueue(encoder.encode(event.output.text));
        },
      }),
    );
}

async function callDifyAgentStream(
  config: { appId: string; apiKey: string },
  prompt: string,
): Promise<ReadableStream<Uint8Array>> {
  const baseUrl = config.appId.replace(/\/+$/, "");
  const url = `${baseUrl}/v1/workflows/run`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      inputs: { query: prompt, input: prompt },
      response_mode: "streaming",
      user: "aicomic-user",
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Dify 工作流请求失败: ${res.status} ${errText.slice(0, 300)}`,
    );
  }
  if (!res.body) throw new Error("Dify 工作流返回为空");

  let streamedText = false;
  const encoder = new TextEncoder();
  return res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(
      new TransformStream({
        transform(message, controller) {
          const event = JSON.parse(message.data) as {
            event: string;
            message?: string;
            data?: {
              text?: string;
              status?: string;
              error?: string;
              outputs?: Record<string, unknown>;
            };
          };
          if (
            event.event === "error" ||
            (event.event === "workflow_finished" &&
              event.data?.status !== "succeeded")
          ) {
            throw new Error(
              event.data?.error || event.message || "Dify 工作流执行失败",
            );
          }
          if (event.event === "text_chunk" && event.data?.text) {
            streamedText = true;
            controller.enqueue(encoder.encode(event.data.text));
          } else if (event.event === "workflow_finished" && !streamedText) {
            const outputs = event.data?.outputs;
            const text = outputs?.text ?? outputs?.result ?? outputs?.output;
            if (typeof text === "string")
              controller.enqueue(encoder.encode(text));
          }
        },
      }),
    );
}

// ── Unified non-streaming caller ────────────────────────────────────

export async function callAgent(
  config: AgentConfig,
  prompt: string,
): Promise<string> {
  switch (config.platform) {
    case "bailian":
      return callBailianAgent(config, prompt);
    case "dify":
      return callDifyAgent(config, prompt);
    case "coze":
      return callCozeAgent(config, prompt);
    default:
      throw new Error(`不支持的智能体平台: ${config.platform}`);
  }
}

// ── 百炼 (DashScope) ────────────────────────────────────────────────

interface BailianResponse {
  status_code?: number;
  output?: { text?: string; finish_reason?: string };
  code?: string;
  message?: string;
}

export async function callBailianAgent(
  config: { appId: string; apiKey: string },
  prompt: string,
): Promise<string> {
  const url = `https://dashscope.aliyuncs.com/api/v1/apps/${config.appId}/completion`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      input: { prompt },
      parameters: {},
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `百炼智能体请求失败: ${res.status} ${errText.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as BailianResponse;

  if (json.code) {
    throw new Error(
      `百炼智能体错误 [${json.code}]: ${json.message ?? "unknown"}`,
    );
  }

  const rawText = json.output?.text;
  if (!rawText) {
    throw new Error("百炼智能体返回为空");
  }
  let text: string = rawText;

  // 百炼 Agent 的工作流模式会将结果包在 {"result": "..."} 中，需要解包
  try {
    const wrapper = JSON.parse(text);
    if (
      wrapper &&
      typeof wrapper === "object" &&
      "result" in wrapper &&
      typeof wrapper.result === "string"
    ) {
      text = wrapper.result;
    }
  } catch {
    // text 不是 JSON wrapper，直接使用原始值
  }

  return text;
}

// ── Dify ─────────────────────────────────────────────────────────────
// API: POST {appId}/v1/workflows/run  (appId 填 Dify 实例 base URL)
// 或    POST https://api.dify.ai/v1/workflows/run
// Auth: Bearer {apiKey}
// Body: { inputs: { query: prompt }, response_mode: "blocking", user: "aicomic" }
// Response: { data: { outputs: { result: "..." } } }

interface DifyResponse {
  data?: {
    outputs?: Record<string, string>;
    error?: string;
    status?: string;
  };
  code?: string;
  message?: string;
}

async function callDifyAgent(
  config: { appId: string; apiKey: string },
  prompt: string,
): Promise<string> {
  // appId is the Dify base URL (e.g. https://api.dify.ai or self-hosted URL)
  const baseUrl = config.appId.replace(/\/+$/, "");
  const url = `${baseUrl}/v1/workflows/run`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      inputs: { query: prompt },
      response_mode: "blocking",
      user: "aicomic-user",
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Dify 工作流请求失败: ${res.status} ${errText.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as DifyResponse;

  if (json.code) {
    throw new Error(`Dify 错误 [${json.code}]: ${json.message ?? "unknown"}`);
  }

  if (json.data?.error) {
    throw new Error(`Dify 工作流执行失败: ${json.data.error}`);
  }

  // Dify outputs is a dict, try common keys: result, text, output
  const outputs = json.data?.outputs;
  if (!outputs) {
    throw new Error("Dify 工作流返回为空");
  }

  const text =
    outputs.result ||
    outputs.text ||
    outputs.output ||
    Object.values(outputs)[0];
  if (!text) {
    throw new Error(`Dify 工作流输出为空: ${JSON.stringify(outputs)}`);
  }

  return text;
}

// ── Coze ─────────────────────────────────────────────────────────────
// API: POST https://api.coze.cn/v1/workflow/run
// Auth: Bearer {apiKey} (Personal Access Token)
// Body: { workflow_id: appId, parameters: { input: prompt } }
// Response: { code: 0, data: "..." } or { code: 0, data: "{json}" }

interface CozeResponse {
  code?: number;
  msg?: string;
  data?: string;
  debug_url?: string;
}

async function callCozeAgent(
  config: { appId: string; apiKey: string },
  prompt: string,
): Promise<string> {
  const url = "https://api.coze.cn/v1/workflow/run";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      workflow_id: config.appId,
      parameters: { input: prompt },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Coze 工作流请求失败: ${res.status} ${errText.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as CozeResponse;

  if (json.code !== 0) {
    throw new Error(`Coze 错误 [${json.code}]: ${json.msg ?? "unknown"}`);
  }

  if (!json.data) {
    throw new Error("Coze 工作流返回为空");
  }

  // Coze workflow returns JSON string like {"result":"..."} — extract the result value
  try {
    const parsed = JSON.parse(json.data);
    if (parsed.result !== undefined) return parsed.result;
  } catch (e) {
    console.warn("[Coze] data 字段 JSON 解析失败, 返回原始值:", e);
  }

  return json.data;
}

export type AgentCategory =
  | "script_outline"
  | "script_generate"
  | "script_parse"
  | "character_extract"
  | "shot_split"
  | "keyframe_prompts"
  | "video_prompts"
  | "ref_image_prompts"
  | "ref_video_prompts";
