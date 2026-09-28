export function buildScriptSplitPrompt(
  scriptChunk: string,
  context: {
    chunkIndex: number;
    totalChunks: number;
    episodeOffset: number;
  },
): string {
  const positionHint =
    context.totalChunks === 1
      ? ""
      : `\nThis is chunk ${context.chunkIndex + 1} of ${context.totalChunks}. Episodes in this chunk should be numbered starting from ${context.episodeOffset + 1}.`;

  return `Split the following text into episodes. Each episode should be a natural narrative unit — use your judgment to find the best split points based on story structure, scene changes, and dramatic beats.${positionHint}

--- TEXT ---
${scriptChunk}
--- END ---

Return ONLY the JSON array. No markdown. No commentary.`;
}
