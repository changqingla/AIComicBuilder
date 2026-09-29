"use client";
import { useParams } from "next/navigation";

import { useEpisodeEditorStore } from "@/stores/episode-editor-store";
import { useTranslations } from "next-intl";

import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";

type GenerationMode = "keyframe" | "reference";

export function GenerationModeTab({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { episodeId } = useParams<{ episodeId: string }>();
  const t = useTranslations("project");
  const { episode, updateDraft } = useEpisodeEditorStore();

  if (!episode) return null;

  const mode = (episode.generationMode || "keyframe") as GenerationMode;

  async function switchMode(newMode: GenerationMode) {
    if (!episode || newMode === mode) return;

    const previous = episode;
    updateDraft(episodeId, { generationMode: newMode });

    try {
      const url = `/api/projects/${episode.projectId}/episodes/${episodeId}`;
      await apiFetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationMode: newMode }),
      });
    } catch (err) {
      updateDraft(episodeId, { generationMode: previous.generationMode });
      toast.error(err instanceof Error ? err.message : "Failed to switch mode");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {(["keyframe", "reference"] as const).map((value) => (
        <label key={value} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="generation-mode"
            value={value}
            checked={mode === value}
            disabled={disabled}
            onChange={() => switchMode(value)}
          />
          {t(
            value === "keyframe"
              ? "generationModeKeyframe"
              : "generationModeReference",
          )}
        </label>
      ))}
    </div>
  );
}
