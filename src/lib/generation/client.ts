import { apiFetch } from "@/lib/api-fetch";
import type { GenerationRequest } from "./request";

export function requestGeneration(
  projectId: string,
  request: GenerationRequest,
) {
  return apiFetch(`/api/projects/${projectId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}
