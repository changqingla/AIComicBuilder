"use client";

import { useDraft } from "@/hooks/use-draft";
import { requestGeneration } from "@/lib/generation/client";

import { InlineModelPicker } from "@/components/editor/model-selector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useModelGuard } from "@/hooks/use-model-guard";
import { buildCharacterTurnaroundPrompt } from "@/lib/ai/prompts/character-image";
import { apiFetch } from "@/lib/api-fetch";
import { uploadUrl } from "@/lib/utils/upload-url";
import { useModelStore, type ModelRef } from "@/stores/model-store";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface CharacterCardProps {
  id: string;
  projectId: string;
  name: string;
  description: string;
  visualHint: string | null;
  referenceImage: string | null;
  referenceImageHistory?: string | null;
  onUpdate: () => void;
  batchGenerating?: boolean;
  scope?: string;
  onPromote?: () => void;
  onDelete?: () => void;
  episodeName?: string;
}

export function CharacterCard({
  id,
  projectId,
  name,
  description,
  visualHint,
  referenceImage,
  referenceImageHistory,
  onUpdate,
  batchGenerating,
  scope,
  onPromote,
  onDelete,
  episodeName,
}: CharacterCardProps) {
  const t = useTranslations();
  const getModelConfig = useModelStore((s) => s.getModelConfig);
  const providers = useModelStore((s) => s.providers);
  const defaultImageModel = useModelStore((s) => s.defaultImageModel);
  const [imageModelRef, setImageModelRef] = useState<ModelRef | null>(null);
  const [editName, setEditName] = useDraft(name);
  const [editDesc, setEditDesc] = useDraft(description);
  const [editVisualHint, setEditVisualHint] = useDraft(visualHint ?? "");

  // Sync local state when props change (e.g. after re-extraction)
  const [generating, setGenerating] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const imageGuard = useModelGuard("image");
  const isGenerating = generating || (!!batchGenerating && !referenceImage);

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

  async function handleSave() {
    await apiFetch(`/api/projects/${projectId}/characters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        description: editDesc,
        visualHint: editVisualHint,
      }),
    });
    onUpdate();
  }

  async function handleGenerateImage() {
    if (!imageGuard()) return;
    setGenerating(true);
    try {
      const response = await requestGeneration(projectId, {
        action: "single_character_image",
        payload: { characterId: id },
        modelConfig: {
          ...getModelConfig(),
          image: resolveImageRef(imageModelRef ?? defaultImageModel),
        },
      });
      await response.json();
    } catch (err) {
      console.error("Character image error:", err);
      toast.error(t("common.generationFailed"));
    }
    setGenerating(false);
    onUpdate();
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiFetch(`/api/projects/${projectId}/characters/${id}/upload`, {
        method: "POST",
        body: form,
      });
      onUpdate();
    } catch (err) {
      console.error("Character image upload error:", err);
      toast.error(t("common.uploadFailed"));
    }
    setUploading(false);
  }

  let history: string[] = [];
  try {
    history = JSON.parse(referenceImageHistory || "[]");
  } catch {}
  if (!history.length && referenceImage) history = [referenceImage];
  const currentIndex = referenceImage ? history.indexOf(referenceImage) : -1;
  async function selectImage(index: number) {
    await apiFetch(`/api/projects/${projectId}/characters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referenceImage: history[index] }),
    });
    onUpdate();
  }
  return (
    <article className="grid gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-10">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <input
            aria-label={t("character.name")}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            className="min-w-0 flex-1 border-b border-transparent bg-transparent py-1 text-lg font-medium hover:border-border focus:border-input focus:outline-none"
          />
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              aria-label={`${t("common.delete")} ${name}`}
            >
              {t("common.delete")}
            </Button>
          )}
        </div>
        <label className="block">
          <span className="text-sm text-muted-foreground">
            {t("character.description")}
          </span>
          <textarea
            aria-label={t("character.description")}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            onBlur={handleSave}
            placeholder={t("character.description")}
            className="editor-textarea min-h-32 border-b border-border"
          />
        </label>
        <label className="mt-5 block">
          <span className="text-sm text-muted-foreground">
            {t("character.visualHint")}
          </span>
          <input
            aria-label={t("character.visualHint")}
            value={editVisualHint}
            onChange={(e) => setEditVisualHint(e.target.value)}
            onBlur={handleSave}
            className="mt-2 w-full border-b border-border bg-transparent py-2 text-sm focus:border-input focus:outline-none"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {episodeName && <span>{episodeName}</span>}
          {scope === "guest" && onPromote && (
            <button
              onClick={onPromote}
              className="underline-offset-4 hover:underline"
            >
              {t("episode.promoteToMain")}
            </button>
          )}
          <button
            className="underline-offset-4 hover:underline"
            onClick={async () => {
              await navigator.clipboard.writeText(
                buildCharacterTurnaroundPrompt(editDesc || editName, editName),
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? t("workspace.copied") : t("shot.copyPrompt")}
          </button>
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        {referenceImage ? (
          <button
            onClick={() => setLightbox(true)}
            aria-label={`${t("workspace.referenceImage")} ${name}`}
            className="block w-full cursor-zoom-in bg-muted"
          >
            <img
              src={uploadUrl(referenceImage)}
              alt={name}
              className="h-44 w-full object-contain"
            />
          </button>
        ) : (
          <div className="flex h-32 items-center justify-center bg-muted text-sm text-muted-foreground">
            {isGenerating
              ? t("common.generating")
              : t("workspace.referenceImage")}
          </div>
        )}
        {history.length > 1 && (
          <label className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            {t("workspace.imageHistory")}
            <select
              aria-label={`${t("workspace.imageHistory")} ${name}`}
              value={currentIndex}
              onChange={(e) => selectImage(Number(e.target.value))}
              className="bg-transparent py-1"
            >
              {history.map((url, index) => (
                <option key={url} value={index}>
                  {index + 1} / {history.length}
                </option>
              ))}
            </select>
          </label>
        )}
        <InlineModelPicker
          capability="image"
          value={imageModelRef ?? defaultImageModel}
          onChange={setImageModelRef}
        />
        <div className="toolbar">
          <Button
            onClick={handleGenerateImage}
            disabled={isGenerating}
            variant="outline"
            size="sm"
          >
            {isGenerating
              ? t("common.generating")
              : t("character.generateImage")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={() => uploadInputRef.current?.click()}
          >
            {uploading ? t("common.loading") : t("character.uploadImage")}
          </Button>
        </div>
      </div>
      {referenceImage && (
        <Dialog open={lightbox} onOpenChange={setLightbox}>
          <DialogContent className="w-[90vw] max-w-[90vw] sm:max-w-[90vw]">
            <DialogTitle>{name}</DialogTitle>
            <img
              src={uploadUrl(referenceImage)}
              alt={name}
              className="max-h-[75vh] w-full object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        aria-label={t("character.uploadImage")}
        className="hidden"
        onChange={handleUploadImage}
      />
    </article>
  );
}
