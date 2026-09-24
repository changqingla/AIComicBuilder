export function buildCharacterExtractPrompt(screenplay: string): string {
  return `Extract and create detailed visual character specifications for EVERY named character in this screenplay. Each description must be specific enough to serve as a binding art reference for consistent AI image generation.

--- SCREENPLAY ---
${screenplay}
--- END ---

IMPORTANT: Your output language MUST match the language of the screenplay above. If it is in Chinese, write ALL fields (name, description, personality) in Chinese.`;
}
