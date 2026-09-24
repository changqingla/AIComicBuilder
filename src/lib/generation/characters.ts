import { createLanguageModel, extractJSON } from "@/lib/ai/ai-sdk";
import { buildCharacterExtractPrompt } from "@/lib/ai/prompts/character-extract";
import { buildCharacterTurnaroundPrompt } from "@/lib/ai/prompts/character-image";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import { resolveImageProvider } from "@/lib/ai/provider-factory";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import {
  characters,
  episodeCharacters,
  episodes,
  projects,
  shots,
} from "@/lib/db/schema";
import {
  characterExtractionSchema,
  saveExtractedCharacters,
} from "@/lib/generation/character-results";
import {
  callProjectAgent,
  extractErrorMessage,
  findBoundAgent,
} from "@/lib/generation/common";
import type { GenerationInput } from "@/lib/generation/request";
import { loadShotAssetsBatch, patchAsset } from "@/lib/shot-asset-utils";
import { selectReferences } from "@/lib/shot-assets";
import { generateText } from "ai";
import { eq, inArray } from "drizzle-orm";

export async function handleCharacterExtract(input: GenerationInput) {
  const { projectId, userId, modelConfig, episodeId } = input;
  let script: string | null = null;

  if (episodeId) {
    const [episode] = await db
      .select()
      .from(episodes)
      .where(eq(episodes.id, episodeId));
    script = episode?.script ?? null;
  } else {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    script = project?.script ?? null;
  }

  if (!script) {
    throw new ApiError(404, "Project or script not found");
  }

  const systemPrompt = await resolvePrompt("character_extract", {
    userId,
    projectId,
  });
  let aiText: string;
  const boundAgent = await findBoundAgent(projectId, "character_extract");
  if (boundAgent) {
    const agentResult = await callProjectAgent(
      boundAgent,
      "character_extract",
      `${systemPrompt}\n\n${buildCharacterExtractPrompt(script)}`,
    );
    aiText = agentResult.text;
  } else {
    if (!modelConfig?.text) {
      throw new ApiError(400, "No text model configured");
    }
    const model = createLanguageModel(modelConfig.text);
    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: buildCharacterExtractPrompt(script),
    });
    aiText = text;
  }

  let result;
  try {
    result = characterExtractionSchema.parse(JSON.parse(extractJSON(aiText)));
  } catch {
    throw new ApiError(422, "Invalid character extraction result");
  }
  saveExtractedCharacters(projectId, episodeId, result);
  return { characters: result.characters };
}

export async function handleSingleCharacterImage(input: GenerationInput) {
  const { payload, modelConfig } = input;
  const characterId = payload?.characterId as string;
  if (!characterId) {
    throw new ApiError(400, "No characterId provided");
  }

  if (!modelConfig?.image) {
    throw new ApiError(400, "No image model configured");
  }

  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId));

  if (!character) {
    throw new ApiError(404, "Character not found");
  }

  const ai = resolveImageProvider(modelConfig);
  const prompt = buildCharacterTurnaroundPrompt(
    character.description || character.name,
    character.name,
  );

  try {
    const imagePath = await ai.generateImage(prompt, {
      size: "2560x1440",
      aspectRatio: "16:9",
      quality: "hd",
    });

    // Append to history
    let history: string[] = [];
    try {
      history = JSON.parse(character.referenceImageHistory || "[]");
    } catch {}
    if (
      character.referenceImage &&
      !history.includes(character.referenceImage)
    ) {
      history.push(character.referenceImage);
    }
    if (!history.includes(imagePath)) {
      history.push(imagePath);
    }

    await db
      .update(characters)
      .set({
        referenceImage: imagePath,
        referenceImageHistory: JSON.stringify(history),
      })
      .where(eq(characters.id, characterId));

    // Mark downstream ref images stale: any shot's referenceImages that include this character
    // as a "characters" entry should have its generated items reset to pending so they're
    // regenerated with the new character reference image.
    const allShots = await db
      .select()
      .from(shots)
      .where(eq(shots.projectId, character.projectId));
    const assetsByShot = await loadShotAssetsBatch(allShots.map((s) => s.id));
    let staleCount = 0;
    for (const shot of allShots) {
      const view = assetsByShot.get(shot.id);
      if (!view) continue;
      const refItems = selectReferences(view);
      let modified = false;
      for (const item of refItems) {
        if (
          item.characters?.includes(character.name) &&
          item.status === "completed"
        ) {
          await patchAsset(item.id, { status: "pending" });
          modified = true;
        }
      }
      if (modified) {
        staleCount++;
      }
    }
    console.log(
      `[SingleCharacterImage] ${character.name} regenerated; marked ${staleCount} shots' ref images as stale`,
    );

    return { characterId, imagePath, status: "ok", staleShots: staleCount };
  } catch (err) {
    console.error(`[SingleCharacterImage] Error for ${character.name}:`, err);
    throw new ApiError(500, extractErrorMessage(err));
  }
}

export async function handleBatchCharacterImage(input: GenerationInput) {
  const { projectId, modelConfig, episodeId } = input;
  if (!modelConfig?.image) {
    throw new ApiError(400, "No image model configured");
  }

  let allCharacters: (typeof characters.$inferSelect)[];
  if (episodeId) {
    const linkedIds = await db
      .select({ characterId: episodeCharacters.characterId })
      .from(episodeCharacters)
      .where(eq(episodeCharacters.episodeId, episodeId));
    allCharacters =
      linkedIds.length > 0
        ? await db
            .select()
            .from(characters)
            .where(
              inArray(
                characters.id,
                linkedIds.map((r) => r.characterId),
              ),
            )
        : [];
  } else {
    allCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
  }

  const needImages = allCharacters.filter((c) => !c.referenceImage);
  if (needImages.length === 0) {
    return { results: [], message: "All characters already have images" };
  }

  const ai = resolveImageProvider(modelConfig);

  const results = await Promise.all(
    needImages.map(async (character) => {
      try {
        const prompt = buildCharacterTurnaroundPrompt(
          character.description || character.name,
          character.name,
        );
        const imagePath = await ai.generateImage(prompt, {
          size: "2560x1440",
          aspectRatio: "16:9",
          quality: "hd",
        });

        // Append to history
        let history: string[] = [];
        try {
          history = JSON.parse(character.referenceImageHistory || "[]");
        } catch {}
        if (
          character.referenceImage &&
          !history.includes(character.referenceImage)
        )
          history.push(character.referenceImage);
        if (!history.includes(imagePath)) history.push(imagePath);

        await db
          .update(characters)
          .set({
            referenceImage: imagePath,
            referenceImageHistory: JSON.stringify(history),
          })
          .where(eq(characters.id, character.id));
        return {
          characterId: character.id,
          name: character.name,
          imagePath,
          status: "ok",
        };
      } catch (err) {
        console.error(
          `[BatchCharacterImage] Error for ${character.name}:`,
          err,
        );
        return {
          characterId: character.id,
          name: character.name,
          status: "error",
          error: extractErrorMessage(err),
        };
      }
    }),
  );

  return { results };
}
