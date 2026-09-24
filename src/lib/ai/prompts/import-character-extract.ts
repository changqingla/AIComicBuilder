export function buildImportCharacterExtractPrompt(textChunk: string): string {
  return `Extract all named characters from the following text. For each character, produce a detailed visual specification suitable for AI image generation. Count their approximate appearances. If the text doesn't describe a character's appearance explicitly, INFER it from their role, era, and context (e.g. a Ming Dynasty emperor wears 龙袍, a soldier wears 铠甲).

--- TEXT ---
${textChunk}
--- END ---

Return ONLY the JSON array.`;
}
