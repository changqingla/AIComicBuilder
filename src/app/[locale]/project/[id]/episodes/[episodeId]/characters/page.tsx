"use client";

import { requestGeneration } from "@/lib/generation/client";
import { useParams } from "next/navigation";

import { useEpisodeEditorStore } from "@/stores/episode-editor-store";
import { useState } from "react";

import { AgentPicker } from "@/components/agent-picker";
import { CharacterCard } from "@/components/editor/character-card";
import { CharacterRelations } from "@/components/editor/character-relations";
import { InlineModelPicker } from "@/components/editor/model-selector";
import { PromptEditButton } from "@/components/prompt-templates/prompt-edit-button";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/page-header";
import { useModelGuard } from "@/hooks/use-model-guard";
import { apiFetch } from "@/lib/api-fetch";
import { useModelStore } from "@/stores/model-store";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
      const response = await requestGeneration(episode.projectId, {
        action: "character_extract",
        modelConfig: getModelConfig(),
        episodeId: episodeId,
      });

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
      const response = await requestGeneration(episode.projectId, {
        action: "batch_character_image",
        modelConfig: getModelConfig(),
        episodeId: episodeId,
      });

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
      <PageHeader title={t("project.characters")}>
        <AgentPicker
          projectId={episode.projectId}
          category="character_extract"
        />
        <InlineModelPicker capability="text" />
        <Button
          onClick={handleExtractCharacters}
          disabled={extracting}
          variant="outline"
          size="sm"
        >
          {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {extracting ? t("common.generating") : t("project.extractCharacters")}
        </Button>
        {episode.characters.length > 0 && hasCharactersWithoutImages && (
          <>
            <InlineModelPicker capability="image" />
            <Button
              onClick={handleBatchGenerateImages}
              disabled={generatingImages}
              variant="outline"
              size="sm"
            >
              {generatingImages ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
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
      </PageHeader>

      {episode.characters.length === 0 ? (
        <div className="empty-state">
          <h3 className="font-sans text-lg font-semibold text-[var(--text-primary)]">
            {t("project.characters")}
          </h3>
          <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">
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
          <div className="divide-y divide-border border-t border-border">
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
