export interface ImportedCharacter {
  name: string;
  frequency: number;
  description: string;
  visualHint?: string;
  scope: "main" | "guest";
}

export interface ImportedEpisode {
  title: string;
  description: string;
  keywords: string;
  idea: string;
  characters?: string[];
}

export interface ImportedRelationship {
  characterA: string;
  characterB: string;
  relationType: string;
  description?: string;
}

export type ImportStep = 1 | 2 | 3 | 4;
export type ImportStepStatus = Record<
  ImportStep,
  "idle" | "running" | "done" | "error"
>;

export interface ImportLog {
  id: string;
  step: ImportStep;
  status: "running" | "done" | "error";
  message: string;
  metadata?: { characters?: ImportedCharacter[]; episodes?: ImportedEpisode[] };
}
