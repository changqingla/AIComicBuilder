"use client";
import { useParams } from "next/navigation";

import { useState } from "react";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";

import { useModelStore } from "@/stores/model-store";
import { CharacterCard } from "@/components/editor/character-card";
import { CharacterRelations } from "@/components/editor/character-relations";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Users, Sparkles, ImageIcon, Loader2 } from "lucide-react";
import { InlineModelPicker } from "@/components/editor/model-selector";
import { apiFetch } from "@/lib/api-fetch";
import { useModelGuard } from "@/hooks/use-model-guard";
import { PromptEditButton } from "@/components/prompt-templates/prompt-edit-button";
import { AgentPicker } from "@/components/agent-picker";
import { toast } from "sonner";

export default function EpisodeCharactersPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const t = useTranslations();
  const { episode, fetchEpisode } = useEpisodeEditorStore();
  const getModelConfig = useModelStore((s) => s.getModelConfig);
  const [extracting, setExtracting] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const textGuard = useModelGuard("text");
  const imageGuard = useModelGuard("image");

  if (!episode) return null;

  const hasCharactersWithoutImages = episode.characters.some(
    (c) => !c.referenceImage,
  );

  async function handleExtractCharacters() {
    if (!episode) return;
    if (!textGuard("character_extract", episode.projectId)) return;
    setExtracting(true);

    try {
      const response = await apiFetch(
        `/api/projects/${episode.projectId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "character_extract",
            modelConfig: getModelConfig(),
            episodeId: episodeId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Character extract failed");
      }

      await response.json();
    } catch (err) {
      console.error("Character extract error:", err);
      toast.error(t("common.generationFailed"));
    }

    setExtracting(false);
    fetchEpisode(episode.projectId, episodeId!);
  }

  async function handleBatchGenerateImages() {
    if (!episode) return;
    if (!imageGuard()) return;
    setGeneratingImages(true);

    try {
      const response = await apiFetch(
        `/api/projects/${episode.projectId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "batch_character_image",
            modelConfig: getModelConfig(),
            episodeId: episodeId,
          }),
        },
      );

      const data = (await response.json()) as {
        results: Array<{ status: string }>;
      };
      if (data.results?.some((r) => r.status === "error")) {
        toast.warning(t("common.batchPartialFailed"));
      }
    } catch (err) {
      console.error("Batch character image error:", err);
      toast.error(t("common.generationFailed"));
    }

    setGeneratingImages(false);
    fetchEpisode(episode.projectId, episodeId!);
  }

  return (
    <div className="animate-page-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[--text-primary]">
              {t("project.characters")}
            </h2>
            <p className="text-xs text-[--text-muted]">
              {episode.characters.length} characters
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AgentPicker
            projectId={episode.projectId}
            category="character_extract"
          />
          <InlineModelPicker capability="text" />
          <Button
            onClick={handleExtractCharacters}
            disabled={extracting}
            variant="default"
            size="sm"
          >
            {extracting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {extracting
              ? t("common.generating")
              : t("project.extractCharacters")}
          </Button>
          {episode.characters.length > 0 && hasCharactersWithoutImages && (
            <>
              <InlineModelPicker capability="image" />
              <Button
                onClick={handleBatchGenerateImages}
                disabled={generatingImages}
                variant="default"
                size="sm"
              >
                {generatingImages ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}
                {generatingImages
                  ? t("common.generating")
                  : t("character.batchGenerateImages")}
              </Button>
            </>
          )}
          <PromptEditButton
            promptKeys="character_extract"
            projectId={episode.projectId}
          />
        </div>
      </div>

      {episode.characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[--border-subtle] bg-[--surface]/50 py-24">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-lg font-semibold text-[--text-primary]">
            {t("project.characters")}
          </h3>
          <p className="mt-2 max-w-sm text-center text-sm text-[--text-secondary]">
            {t("character.noCharacters")}
          </p>
        </div>
      ) : (
        <>
          {episode.characters.length >= 2 && (
            <div className="mb-4">
              <CharacterRelations
                projectId={episode.projectId}
                characters={episode.characters.map((c) => ({
                  id: c.id,
                  name: c.name,
                }))}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {episode.characters.map((char) => (
              <CharacterCard
                key={char.id}
                id={char.id}
                projectId={episode.projectId}
                name={char.name}
                description={char.description}
                visualHint={char.visualHint ?? null}
                referenceImage={char.referenceImage}
                referenceImageHistory={char.referenceImageHistory}
                onUpdate={() => fetchEpisode(episode.projectId, episodeId!)}
                batchGenerating={generatingImages}
                scope={char.scope}
                onPromote={
                  char.scope === "guest"
                    ? async () => {
                        await apiFetch(
                          `/api/projects/${episode.projectId}/characters/${char.id}`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              scope: "main",
                              episodeId: null,
                            }),
                          },
                        );
                        fetchEpisode(episode.projectId, episodeId!);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
