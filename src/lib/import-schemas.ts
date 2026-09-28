import { z } from "zod";

export const importedEpisodeSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string(),
  keywords: z.string(),
  idea: z.string(),
  characters: z.array(z.string()).optional(),
});

export const importedEpisodesSchema = z.array(importedEpisodeSchema).min(1);
