import type { ShotAsset } from "@/lib/shot-assets";

export interface Character {
  id: string;
  name: string;
  description: string;
  referenceImage: string | null;
  referenceImageHistory?: string | null;
  visualHint?: string | null;
  scope?: string;
  episodeId?: string | null;
}

export interface Dialogue {
  id: string;
  text: string;
  characterId: string;
  characterName: string;
  sequence: number;
}

export interface Shot {
  id: string;
  sequence: number;
  prompt: string;
  videoScript: string | null;
  motionScript: string | null;
  cameraDirection: string;
  duration: number;
  sceneId?: string;
  transitionIn?: string;
  transitionOut?: string;
  videoPrompt: string | null;
  compositionGuide?: string;
  focalPoint?: string;
  depthOfField?: string;
  soundDesign?: string;
  musicCue?: string;
  qualityScore?: number;
  qualityIssues?: string[];
  isStale?: boolean;
  status: string;
  dialogues: Dialogue[];
  /** All shot_assets rows, including inactive versions used by the history picker. */
  assets: ShotAsset[];
}

export type StoryboardVersion = {
  id: string;
  label: string;
  versionNum: number;
  createdAt: number;
};
