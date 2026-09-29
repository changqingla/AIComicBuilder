"use client";

import { requestGeneration } from "@/lib/generation/client";

import { InlineModelPicker } from "@/components/editor/model-selector";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useModelGuard } from "@/hooks/use-model-guard";
import { uploadUrl } from "@/lib/utils/upload-url";
import { useModelStore, type ModelRef } from "@/stores/model-store";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

interface Character {
  id: string;
  name: string;
  referenceImage: string | null;
}

interface CharactersInlinePanelProps {
  characters: Character[];
  projectId: string;
  generationMode: "keyframe" | "reference";
  onUpdate: () => void;
}

export function CharactersInlinePanel({
  characters,
  projectId,
  generationMode,
  onUpdate,
}: CharactersInlinePanelProps) {
  const t = useTranslations("project");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const getModelConfig = useModelStore((s) => s.getModelConfig);
  const providers = useModelStore((s) => s.providers);
  const defaultImageModel = useModelStore((s) => s.defaultImageModel);
  const imageGuard = useModelGuard("image");

  const [imageModelRef, setImageModelRef] = useState<ModelRef | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const storageKey = `charPanel:${projectId}`;
  const anyMissingRef = characters.some((c) => !c.referenceImage);

  const [open, setOpen] = useState(
    () =>
      (generationMode === "reference" && anyMissingRef) ||
      (typeof window !== "undefined" &&
        localStorage.getItem(storageKey) === "true"),
  );

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }

  function resolveImageRef(ref: ModelRef | null) {
    if (!ref) return null;
    const provider = providers.find((p) => p.id === ref.providerId);
    if (!provider) return null;
    return {
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      secretKey: provider.secretKey,
      modelId: ref.modelId,
    };
  }

  async function handleGenerate(characterId: string) {
    if (!imageGuard()) return;
    setGeneratingId(characterId);
    try {
      await requestGeneration(projectId, {
        action: "single_character_image",
        payload: { characterId },
        modelConfig: {
          ...getModelConfig(),
          image: resolveImageRef(imageModelRef ?? defaultImageModel),
        },
      });
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tCommon("generationFailed"),
      );
    }
    setGeneratingId(null);
  }

  if (characters.length === 0) return null;

  return (
    <div>
      <button
        className="py-1 text-sm text-muted-foreground"
        onClick={toggle}
        aria-expanded={open}
      >
        {t("charactersPanel")} ({characters.length})
      </button>
      {open && (
        <div className="space-y-4 py-4">
          <InlineModelPicker
            capability="image"
            value={imageModelRef ?? defaultImageModel}
            onChange={setImageModelRef}
          />
          <div className="flex flex-wrap gap-5">
            {characters.map((char) => (
              <div key={char.id} className="w-28 space-y-2 text-sm">
                {char.referenceImage ? (
                  <button
                    onClick={() =>
                      setPreviewSrc(uploadUrl(char.referenceImage!))
                    }
                    className="block w-full"
                    aria-label={char.name}
                  >
                    <img
                      src={uploadUrl(char.referenceImage)}
                      alt={char.name}
                      className="h-20 w-full object-contain bg-muted"
                    />
                  </button>
                ) : (
                  <button
                    onClick={() => handleGenerate(char.id)}
                    disabled={!!generatingId}
                    className="flex h-20 w-full items-center justify-center bg-muted text-xs text-muted-foreground"
                  >
                    {generatingId === char.id
                      ? tCommon("generating")
                      : t("generateFrames")}
                  </button>
                )}
                <p className="truncate text-muted-foreground">{char.name}</p>
              </div>
            ))}
          </div>
          <Link
            href={`/${locale}/project/${projectId}/characters`}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            {t("charactersPanelEdit")}
          </Link>
        </div>
      )}
      <Dialog
        open={!!previewSrc}
        onOpenChange={(value) => {
          if (!value) setPreviewSrc(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogTitle>{t("charactersPanel")}</DialogTitle>
          {previewSrc && (
            <img
              src={previewSrc}
              alt={t("charactersPanel")}
              className="max-h-[75vh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
