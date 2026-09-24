import { db } from "@/lib/db";
import { characterRelations,characters,episodeCharacters } from "@/lib/db/schema";
import { id } from "@/lib/id";
import { and,eq,inArray } from "drizzle-orm";
import { z } from "zod";

export const characterExtractionSchema = z.object({
  characters: z.array(z.object({
    name: z.string().trim().min(1),
    description: z.string(),
    visualHint: z.string().default(""),
    scope: z.enum(["main", "guest"]).default("main"),
    heightCm: z.number().nonnegative().default(0),
    bodyType: z.string().default("average"),
    performanceStyle: z.string().default(""),
  })).min(1),
  relationships: z.array(z.object({
    characterA: z.string(), characterB: z.string(), relationType: z.string(),
    description: z.string().default(""),
  })).default([]),
});

export function saveExtractedCharacters(
  projectId: string,
  episodeId: string | undefined,
  result: z.infer<typeof characterExtractionSchema>,
) {
  db.transaction((tx) => {
    const existing = tx.select().from(characters).where(eq(characters.projectId, projectId)).all();
    const byName = new Map(existing.map((character) => [character.name.toLowerCase().trim(), character.id]));
    const oldLinks = episodeId
      ? tx.select().from(episodeCharacters).where(eq(episodeCharacters.episodeId, episodeId)).all()
      : [];
    const linkedIds = new Set<string>();
    for (const character of result.characters) {
      const key = character.name.toLowerCase();
      const characterId = byName.get(key) ?? id();
      tx.insert(characters).values({ ...character, id: characterId, projectId })
        .onConflictDoUpdate({ target: characters.id, set: character }).run();
      byName.set(key, characterId);
      linkedIds.add(characterId);
    }

    if (episodeId) {
      tx.delete(episodeCharacters).where(eq(episodeCharacters.episodeId, episodeId)).run();
      for (const characterId of linkedIds) {
        tx.insert(episodeCharacters).values({ id: id(), episodeId, characterId }).run();
      }
      const oldIds = oldLinks.map((link) => link.characterId);
      if (oldIds.length) tx.delete(characterRelations).where(and(
        eq(characterRelations.projectId, projectId),
        inArray(characterRelations.characterAId, oldIds),
        inArray(characterRelations.characterBId, oldIds),
      )).run();
    } else {
      tx.delete(characterRelations).where(eq(characterRelations.projectId, projectId)).run();
    }

    const relationPairs = new Set<string>();
    for (const relation of result.relationships) {
      const characterAId = byName.get(relation.characterA.toLowerCase().trim());
      const characterBId = byName.get(relation.characterB.toLowerCase().trim());
      if (!characterAId || !characterBId || characterAId === characterBId) continue;
      const pair = [characterAId, characterBId].sort().join(":");
      if (relationPairs.has(pair)) continue;
      relationPairs.add(pair);
      tx.insert(characterRelations).values({
        id: id(), projectId, characterAId, characterBId,
        relationType: relation.relationType, description: relation.description,
      }).run();
    }
  });
}
