import type { Shot } from "@/lib/editor-types";

export interface ShotEditorProps {
  shot: Shot;
  projectId: string;
  onUpdate: () => void | Promise<void>;
  generationMode: "keyframe" | "reference";
  videoRatio: string;
  versionId: string | null;
  disabled?: boolean;
  batchGeneratingFrames?: boolean;
  batchGeneratingVideoPrompts?: boolean;
  batchGeneratingVideos?: boolean;
}
