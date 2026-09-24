import { NextResponse } from "next/server";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import {
  generationRequestSchema,
  hasGenerationAccess,
} from "@/lib/generation/request";
import { ApiError } from "@/lib/api-error";
import {
  handleScriptOutlineAction,
  handleScriptGenerate,
  handleScriptParseStream,
} from "@/lib/generation/scripts";
import {
  handleCharacterExtract,
  handleSingleCharacterImage,
  handleBatchCharacterImage,
} from "@/lib/generation/characters";
import {
  handleShotSplit,
  handleSingleShotRewrite,
} from "@/lib/generation/storyboards";
import {
  handleBatchFrameGenerate,
  handleSingleFrameGenerate,
} from "@/lib/generation/frames";
import { handleGenerateAssetPrompts } from "@/lib/generation/asset-prompts";
import {
  handleSingleVideoGenerate,
  handleBatchVideoGenerate,
} from "@/lib/generation/videos";
import {
  handleSingleReferenceVideo,
  handleBatchReferenceVideo,
} from "@/lib/generation/reference-videos";
import {
  handleSingleSceneFrame,
  handleBatchSceneFrame,
  handleSingleRefImageGenerate,
  handleSingleShotRefImageGenerateAll,
} from "@/lib/generation/reference-images";
import {
  handleSingleVideoPrompt,
  handleBatchVideoPrompt,
} from "@/lib/generation/video-prompts";
import { handleVideoAssemble } from "@/lib/generation/assembly";
import { handleAiOptimizeText } from "@/lib/generation/optimize";

export const maxDuration = 300;

const handlers = {
  script_outline: handleScriptOutlineAction,
  script_generate: handleScriptGenerate,
  script_parse: handleScriptParseStream,
  character_extract: handleCharacterExtract,
  single_character_image: handleSingleCharacterImage,
  batch_character_image: handleBatchCharacterImage,
  shot_split: handleShotSplit,
  generate_keyframe_prompts: handleGenerateAssetPrompts,
  single_shot_rewrite: handleSingleShotRewrite,
  batch_frame_generate: handleBatchFrameGenerate,
  single_frame_generate: handleSingleFrameGenerate,
  single_video_generate: handleSingleVideoGenerate,
  batch_video_generate: handleBatchVideoGenerate,
  single_scene_frame: handleSingleSceneFrame,
  batch_scene_frame: handleBatchSceneFrame,
  single_reference_video: handleSingleReferenceVideo,
  batch_reference_video: handleBatchReferenceVideo,
  single_video_prompt: handleSingleVideoPrompt,
  batch_video_prompt: handleBatchVideoPrompt,
  ai_optimize_text: handleAiOptimizeText,
  video_assemble: handleVideoAssemble,
  single_ref_image_generate: handleSingleRefImageGenerate,
  generate_ref_prompts: handleGenerateAssetPrompts,
  single_ref_image_generate_all: handleSingleShotRefImageGenerateAll,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const project = await assertProjectOwnership(request, projectId);
  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = generationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid generation request", details: parsed.error.issues },
      { status: 400 },
    );
  if (!hasGenerationAccess(projectId, parsed.data))
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  try {
    const result = await handlers[parsed.data.action]({
      ...parsed.data,
      projectId,
      userId: project.userId,
    });
    return result instanceof ReadableStream
      ? new Response(result, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      : NextResponse.json(result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status });
  }
}
