export function buildScriptParsePrompt(script: string): string {
  return `Analyze and structure the following story into a production-ready screenplay. Identify the narrative beats, define clear scenes with rich visual descriptions, and extract all dialogue with precise delivery directions.

--- SOURCE TEXT ---
${script}
--- END ---

IMPORTANT: Your output language MUST match the language of the source text above. If it is in Chinese, write ALL JSON text fields in Chinese. Do NOT translate to English.`;
}
