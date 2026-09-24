import { create } from "zustand";
import { apiFetch } from "@/lib/api-fetch";
import type { Character, Shot, StoryboardVersion } from "@/lib/editor-types";
import type { Episode } from "./episode-store";

export interface EpisodeDetail extends Omit<Episode, "idea" | "script"> {
  idea: string;
  script: string;
  outline: string;
  characters: Character[];
  shots: Shot[];
  versions: StoryboardVersion[];
}

interface EpisodeEditorStore {
  scope: { projectId: string; episodeId: string } | null;
  episode: EpisodeDetail | null;
  loading: boolean;
  error: string | null;
  openEpisode: (projectId: string, episodeId: string) => Promise<void>;
  fetchEpisode: (projectId: string, episodeId: string, versionId?: string) => Promise<void>;
  updateDraft: (episodeId: string, patch: Partial<EpisodeDetail>) => void;
}

let requestNumber = 0;
export const useEpisodeEditorStore = create<EpisodeEditorStore>((set, get) => ({
  scope: null, episode: null, loading: false, error: null,
  openEpisode: async (projectId, episodeId) => {
    set({ scope: { projectId, episodeId }, episode: null, loading: true });
    await get().fetchEpisode(projectId, episodeId);
  },
  fetchEpisode: async (projectId, episodeId, versionId) => {
    if (get().scope?.projectId !== projectId || get().scope?.episodeId !== episodeId) return;
    const request = ++requestNumber;
    set({ error: null });
    try {
      const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
      const response = await apiFetch(`/api/projects/${projectId}/episodes/${episodeId}${query}`);
      const episode: EpisodeDetail = await response.json();
      if (request === requestNumber) set({ episode, loading: false });
    } catch (error) {
      if (request === requestNumber) set({ error: String(error), loading: false });
    }
  },
  updateDraft: (episodeId, patch) => set((state) => state.episode?.id === episodeId
    ? { episode: { ...state.episode, ...patch } } : {}),
}));
