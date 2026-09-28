import { NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { db } from "@/lib/db";
import {
  episodes,
  characters,
  episodeCharacters,
  characterRelations,
  importLogs,
} from "@/lib/db/schema";
import { id } from "@/lib/id";
import { addImportLog } from "@/lib/import-utils";
import { importedEpisodesSchema } from "@/lib/import-schemas";

export const maxDuration = 60;

const importSchema = z.object({
  episodes: importedEpisodesSchema,
  characters: z.array(
    z.object({
      name: z.string().trim().min(1),
      scope: z.enum(["main", "guest"]),
      description: z.string(),
      visualHint: z.string().optional(),
    }),
  ),
  relationships: z.array(
    z.object({
      characterA: z.string(),
      characterB: z.string(),
      relationType: z.string(),
      description: z.string().optional(),
    }),
  ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  if (!(await assertProjectOwnership(request, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid import data", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  await addImportLog(
    projectId,
    4,
    "running",
    `开始创建 ${body.episodes.length} 集和 ${body.characters.length} 个角色`,
  );

  try {
    const created = db.transaction((tx) => {
      const charIdByName = new Map<string, string>();
      for (const character of body.characters) {
        const characterId = id();
        tx.insert(characters)
          .values({ ...character, id: characterId, projectId })
          .run();
        charIdByName.set(character.name.toLowerCase().trim(), characterId);
      }
      for (const relation of body.relationships) {
        const characterAId = charIdByName.get(
          relation.characterA.toLowerCase().trim(),
        );
        const characterBId = charIdByName.get(
          relation.characterB.toLowerCase().trim(),
        );
        if (!characterAId || !characterBId || characterAId === characterBId)
          continue;
        tx.insert(characterRelations)
          .values({
            id: id(),
            projectId,
            characterAId,
            characterBId,
            relationType: relation.relationType || "neutral",
            description: relation.description ?? "",
          })
          .onConflictDoNothing()
          .run();
      }
      const last = tx
        .select({ sequence: max(episodes.sequence) })
        .from(episodes)
        .where(eq(episodes.projectId, projectId))
        .get();
      let sequence = (last?.sequence ?? 0) + 1;
      const result = [];
      let relationCount = 0;
      for (const episode of body.episodes) {
        const createdEpisode = tx
          .insert(episodes)
          .values({
            id: id(),
            projectId,
            title: episode.title,
            description: episode.description,
            keywords: episode.keywords,
            idea: episode.idea,
            sequence: sequence++,
          })
          .returning()
          .get();
        result.push(createdEpisode);
        const linkedIds = new Set(
          (episode.characters ?? []).map((name) =>
            charIdByName.get(name.toLowerCase().trim()),
          ),
        );
        for (const characterId of linkedIds) {
          if (!characterId) continue;
          tx.insert(episodeCharacters)
            .values({ id: id(), episodeId: createdEpisode.id, characterId })
            .run();
          relationCount++;
        }
      }
      tx.insert(importLogs)
        .values({
          id: id(),
          projectId,
          step: 4,
          status: "done",
          message: `导入完成！创建了 ${body.characters.length} 个角色和 ${result.length} 集（${relationCount} 个角色分配）`,
          metadata: {
            episodeCount: result.length,
            characterCount: body.characters.length,
          },
        })
        .run();
      return result;
    });
    return NextResponse.json(
      { episodes: created, characterCount: body.characters.length },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await addImportLog(projectId, 4, "error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
