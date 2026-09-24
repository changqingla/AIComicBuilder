import { afterEach, expect, test, vi } from "vitest";
import fs from "node:fs";
import { generateText } from "ai";
import { callAgentStream } from "@/lib/ai/agent-caller";
import { createLanguageModel } from "@/lib/ai/ai-sdk";
import { OpenAIProvider } from "@/lib/ai/providers/openai";

afterEach(() => vi.unstubAllGlobals());
function events(values: unknown[]) {
  const bytes = new TextEncoder().encode(
    values.map((value) => `data: ${JSON.stringify(value)}\r\n\r\n`).join(""),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        // Split inside UTF-8 characters and SSE fields, just as the network may do.
        for (let i = 0; i < bytes.length; i += 3)
          controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    }),
  );
}

test("Dify emits text once even with repeated intermediate node outputs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      events([
        { event: "text_chunk", data: { text: "你好" } },
        { event: "node_finished", data: { outputs: { text: "你好" } } },
        { event: "node_finished", data: { outputs: { text: "你好" } } },
        {
          event: "workflow_finished",
          data: { status: "succeeded", outputs: { text: "你好" } },
        },
      ]),
    ),
  );
  const stream = await callAgentStream(
    { platform: "dify", appId: "https://dify.test", apiKey: "test" },
    "test",
  );
  expect(await new Response(stream).text()).toBe("你好");
});

test("Dify uses the workflow output when there are no text chunks and propagates failures", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      events([
        { event: "node_finished", data: { outputs: { text: "internal" } } },
        {
          event: "workflow_finished",
          data: { status: "succeeded", outputs: { text: "final" } },
        },
      ]),
    )
    .mockResolvedValueOnce(
      events([
        {
          event: "workflow_finished",
          data: { status: "failed", error: "Model unavailable" },
        },
      ]),
    );
  vi.stubGlobal("fetch", fetch);
  const config = {
    platform: "dify" as const,
    appId: "https://dify.test",
    apiKey: "test",
  };
  expect(await new Response(await callAgentStream(config, "test")).text()).toBe(
    "final",
  );
  await expect(
    new Response(await callAgentStream(config, "test")).text(),
  ).rejects.toThrow("Model unavailable");
});

test("Gemini sends requests to the configured address", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      candidates: [
        {
          content: { role: "model", parts: [{ text: "ok" }] },
          finishReason: "STOP",
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const model = createLanguageModel({
    protocol: "gemini",
    baseUrl: "https://gateway.test/v1beta",
    apiKey: "test",
    modelId: "gemini-test",
  });
  expect(
    (await generateText({ model, prompt: "test", maxRetries: 0 })).text,
  ).toBe("ok");
  expect(String(fetch.mock.calls[0][0])).toContain(
    "https://gateway.test/v1beta/models/gemini-test",
  );
});

test("OpenAI image responses accept Base64 without a second download request", async () => {
  const content = Buffer.from("test-image");
  const fetch = vi.fn(async () =>
    Response.json({
      created: 1,
      data: [{ b64_json: content.toString("base64") }],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const provider = new OpenAIProvider({
    apiKey: "test",
    baseURL: "https://images.test/v1",
    model: "test-image",
    uploadDir: process.env.UPLOAD_DIR,
  });
  const image = await provider.generateImage("a frame");
  expect(fs.readFileSync(image)).toEqual(content);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("Bailian uses the SSE parser for split UTF-8 data and propagates service errors", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      events([{ output: { text: "你好" } }, { output: { text: "，森林" } }]),
    )
    .mockResolvedValueOnce(
      events([{ code: "InvalidApiKey", message: "Rejected" }]),
    );
  vi.stubGlobal("fetch", fetch);
  const config = {
    platform: "bailian" as const,
    appId: "test",
    apiKey: "test",
  };
  expect(await new Response(await callAgentStream(config, "test")).text()).toBe(
    "你好，森林",
  );
  await expect(
    new Response(await callAgentStream(config, "test")).text(),
  ).rejects.toThrow("Rejected");
});
