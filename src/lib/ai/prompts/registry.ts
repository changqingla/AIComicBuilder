import type { PromptDefinition } from "./definition";
import {
  characterExtractDef,
  characterImageDef,
  importCharacterExtractDef,
} from "./definitions/character";
import {
  frameGenerateFirstDef,
  frameGenerateLastDef,
  refImagePromptsDef,
  sceneFrameGenerateDef,
} from "./definitions/frame";
import {
  scriptGenerateDef,
  scriptOutlineDef,
  scriptParseDef,
  scriptSplitDef,
} from "./definitions/script";
import { shotKeyframeAssetsDef, shotSplitDef } from "./definitions/shot";
import {
  refVideoGenerateDef,
  refVideoPromptDef,
  videoGenerateDef,
} from "./definitions/video";

export const PROMPT_REGISTRY: PromptDefinition[] = [
  scriptOutlineDef,
  scriptGenerateDef,
  scriptParseDef,
  scriptSplitDef,
  characterExtractDef,
  importCharacterExtractDef,
  characterImageDef,
  shotSplitDef,
  shotKeyframeAssetsDef,
  frameGenerateFirstDef,
  frameGenerateLastDef,
  sceneFrameGenerateDef,
  refImagePromptsDef,
  videoGenerateDef,
  refVideoGenerateDef,
  refVideoPromptDef,
];

export const PROMPT_REGISTRY_MAP: Record<string, PromptDefinition> =
  Object.fromEntries(PROMPT_REGISTRY.map((d) => [d.key, d]));

/**
 * Look up a prompt definition by key.
 */
export function getPromptDefinition(key: string): PromptDefinition | undefined {
  return PROMPT_REGISTRY_MAP[key];
}

/**
 * Get the default slot contents for a prompt definition as a plain object.
 */
export function getDefaultSlotContents(
  key: string,
): Record<string, string> | undefined {
  const def = PROMPT_REGISTRY_MAP[key];
  if (!def) return undefined;
  const result: Record<string, string> = {};
  for (const s of def.slots) {
    result[s.key] = s.defaultContent;
  }
  return result;
}
