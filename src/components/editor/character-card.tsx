"use client";

import { requestGeneration } from "@/lib/generation/client";
import { useDraft } from "@/hooks/use-draft";

import { InlineModelPicker } from "@/components/editor/model-selector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useModelGuard } from "@/hooks/use-model-guard";
import { buildCharacterTurnaroundPrompt } from "@/lib/ai/prompts/character-image";
import { apiFetch } from "@/lib/api-fetch";
import { uploadUrl } from "@/lib/utils/upload-url";
import { useModelStore, type ModelRef } from "@/stores/model-store";
import {
  ArrowUpCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  ImageIcon,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
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
    <article className="workspace-panel grid overflow-hidden lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)] 2xl:grid-cols-1">
      <div className="flex min-w-0 flex-col border-b border-border bg-muted/40 lg:border-b-0 lg:border-r 2xl:border-b 2xl:border-r-0">
        <div className="relative flex min-h-52 flex-1 items-center justify-center p-5">
          {referenceImage ? (
            <button
              onClick={() => setLightbox(true)}
              aria-label={`${t("workspace.referenceImage")} ${name}`}
              className="w-full cursor-zoom-in"
            >
              <img
                src={uploadUrl(referenceImage)}
                alt={name}
                className="max-h-72 w-full object-contain"
              />
            </button>
          ) : isGenerating ? (
            <Loader2 className="size-7 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <UserRound className="size-10" strokeWidth={1.2} />
              <span className="text-sm">{t("workspace.referenceImage")}</span>
            </div>
          )}
        </div>
        {history.length > 1 && (
          <div className="flex items-center justify-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Previous image ${name}`}
              onClick={() =>
                selectImage(
                  (currentIndex - 1 + history.length) % history.length,
                )
              }
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="tabular-nums">
              {currentIndex + 1} / {history.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Next image ${name}`}
              onClick={() => selectImage((currentIndex + 1) % history.length)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {scope && (
              <span>
                {scope === "main"
                  ? t("episode.mainCharacter")
                  : t("episode.guestCharacter")}
              </span>
            )}
            {episodeName && <span>{episodeName}</span>}
            {scope === "guest" && onPromote && (
              <button
                onClick={onPromote}
                className="inline-flex items-center gap-1.5 text-primary"
              >
                <ArrowUpCircle className="size-3.5" />
                {t("episode.promoteToMain")}
              </button>
            )}
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label={`${t("common.delete")} ${name}`}
              title={t("common.delete")}
              className="hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
        <label className="block space-y-2">
          <span className="field-label">{t("character.name")}</span>
          <Input
            aria-label={t("character.name")}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            className="font-semibold"
          />
        </label>
        <label className="block space-y-2">
          <span className="field-label">{t("character.description")}</span>
          <Textarea
            aria-label={t("character.description")}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            onBlur={handleSave}
            placeholder={t("character.description")}
            className="min-h-28 text-sm leading-7"
          />
        </label>
        <label className="block space-y-2">
          <span className="field-label">{t("character.visualHint")}</span>
          <Input
            aria-label={t("character.visualHint")}
            value={editVisualHint}
            onChange={(e) => setEditVisualHint(e.target.value)}
            onBlur={handleSave}
            placeholder={t("character.visualHint")}
          />
        </label>
        <div className="toolbar border-t border-border pt-4">
          <InlineModelPicker
            capability="image"
            value={imageModelRef ?? defaultImageModel}
            onChange={setImageModelRef}
          />
          <Button
            onClick={handleGenerateImage}
            disabled={isGenerating}
            variant={referenceImage ? "outline" : "default"}
            size="sm"
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImageIcon className="size-4" />
            )}
            {isGenerating
              ? t("common.generating")
              : t("character.generateImage")}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("character.uploadImage")}
            title={t("character.uploadImage")}
            disabled={uploading}
            onClick={() => uploadInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("shot.copyPrompt")}
            title={t("shot.copyPrompt")}
            onClick={async () => {
              await navigator.clipboard.writeText(
                buildCharacterTurnaroundPrompt(editDesc || editName, editName),
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
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
