import { create } from "zustand";
import { apiFetch } from "@/lib/api-fetch";

interface Project {
  id: string;
  title: string;
}

interface ProjectStore {
  project: Project | null;
  loading: boolean;
  error: string | null;
  fetchProject: (id: string) => Promise<void>;
}

let requestNumber = 0;
export const useProjectStore = create<ProjectStore>((set) => ({
  project: null, loading: false, error: null,
  fetchProject: async (id) => {
    const request = ++requestNumber;
    set({ loading: true, error: null });
    try {
      const response = await apiFetch(`/api/projects/${id}`);
      const project: Project = await response.json();
      if (request === requestNumber) set({ project, loading: false });
    } catch (error) {
      if (request === requestNumber) set({ loading: false, error: String(error) });
    }
  },
}));
