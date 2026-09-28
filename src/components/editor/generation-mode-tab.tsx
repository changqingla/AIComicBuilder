"use client";
import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";

import { apiFetch } from "@/lib/api-fetch";
import { Film, ImageIcon } from "lucide-react";
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
    <div className="inline-flex gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] p-1">
      <button
        disabled={disabled}
        aria-pressed={mode === "keyframe"}
        onClick={() => switchMode("keyframe")}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
          mode === "keyframe"
            ? "bg-white text-foreground shadow-sm"
            : "text-[var(--text-muted)] hover:bg-white/60 hover:text-[var(--text-secondary)]"
        }`}
      >
        <Film
          className={`h-4 w-4 ${mode === "keyframe" ? "text-primary" : ""}`}
        />
        {t("generationModeKeyframe")}
      </button>
      <button
        disabled={disabled}
        aria-pressed={mode === "reference"}
        onClick={() => switchMode("reference")}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
          mode === "reference"
            ? "bg-white text-foreground shadow-sm"
            : "text-[var(--text-muted)] hover:bg-white/60 hover:text-[var(--text-secondary)]"
        }`}
      >
        <ImageIcon
          className={`h-4 w-4 ${mode === "reference" ? "text-primary" : ""}`}
        />
        {t("generationModeReference")}
      </button>
    </div>
  );
}
