import type { ShotAsset } from "@/lib/shot-assets";
import { create } from "zustand";
import { apiFetch } from "@/lib/api-fetch";

interface Character {
  id: string;
  name: string;
  description: string;
  referenceImage: string | null;
  referenceImageHistory?: string | null;
  visualHint?: string | null;
  scope?: string;
  episodeId?: string | null;
}

interface Dialogue {
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
  /** Active shot_assets rows for this shot, all types mixed. */
  assets: ShotAsset[];
}

export type StoryboardVersion = {
  id: string;
  label: string;
  versionNum: number;
  createdAt: number;
};

interface Project {
  id: string;
  title: string;
  idea: string;
  script: string;
  outline?: string;
  status: string;
  finalVideoUrl: string | null;
  generationMode: "keyframe" | "reference";
  characters: Character[];
  shots: Shot[];
  versions: StoryboardVersion[];
}

interface ProjectStore {
  project: Project | null;
  loading: boolean;
  currentEpisodeId: string | null;
  fetchProject: (id: string, episodeId?: string, versionId?: string) => Promise<void>;
  updateIdea: (idea: string) => void;
  updateScript: (script: string) => void;
  setProject: (project: Project) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  loading: false,
  currentEpisodeId: null,

  fetchProject: async (id: string, episodeId?: string, versionId?: string) => {
    // Only show loading spinner on initial load (no project yet).
    // Version switches are background refreshes — don't unmount children.
    if (!get().project) set({ loading: true });

    let url: string;
    if (episodeId) {
      url = `/api/projects/${id}/episodes/${episodeId}${versionId ? `?versionId=${versionId}` : ""}`;
    } else {
      url = `/api/projects/${id}${versionId ? `?versionId=${versionId}` : ""}`;
    }

    const res = await apiFetch(url);
    const data = await res.json();
    set({ project: data, loading: false, currentEpisodeId: episodeId ?? null });
  },

  updateIdea: (idea: string) => {
    set((state) => ({
      project: state.project ? { ...state.project, idea } : null,
    }));
  },

  updateScript: (script: string) => {
    set((state) => ({
      project: state.project ? { ...state.project, script } : null,
    }));
  },

  setProject: (project: Project) => {
    set({ project });
  },
}));
