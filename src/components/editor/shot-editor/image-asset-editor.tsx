"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { useDraft } from "@/hooks/use-draft";
import { useAutosave } from "@/hooks/use-autosave";
import {
  useShotMutations,
  type AssetChanges,
} from "@/hooks/use-shot-mutations";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";
import type { ShotAsset } from "@/lib/shot-assets";
import { Textarea } from "@/components/ui/textarea";
import { AiOptimizeButton } from "../ai-optimize-button";
import { InlineModelPicker } from "../model-selector";
import { AssetMedia } from "./asset-media";
import type { Media } from "./media-preview";
import type { ShotEditorProps } from "./types";

type ImageType = "first_frame" | "last_frame" | "reference";
export function ImageAssetEditor({
  editor,
  asset,
  type,
  label,
  busy,
  onGenerate,
  onPreview,
}: {
  editor: ShotEditorProps;
  asset?: ShotAsset;
  type: ImageType;
  label: string;
  busy: boolean;
  onGenerate: (asset: ShotAsset) => Promise<void>;
  onPreview: (media: Media) => void;
}) {
  const t = useTranslations();
  const mutations = useShotMutations(
    editor.projectId,
    editor.shot.id,
    editor.onUpdate,
  );
  const characters = useEpisodeEditorStore((s) => s.episode?.characters);
  const [prompt, setPrompt] = useDraft(asset?.prompt ?? "");
  const [changing, setChanging] = useState<
    "upload" | "version" | "remove" | "metadata" | null
  >(null);
  const [regenerating, setRegenerating] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const disabled = busy || !!changing || regenerating;
  const items = editor.shot.assets.filter(
    (a) => a.isActive === 1 && a.type === type,
  );
  async function update(changes: AssetChanges) {
    return asset
      ? mutations.updateAsset(asset.id, changes)
      : mutations.replaceAssets(type, [
          { sequenceInType: 0, prompt, ...changes },
        ]);
  }
  const savePrompt = useAutosave((value: string) => update({ prompt: value }));
  async function change(
    kind: NonNullable<typeof changing>,
    operation: () => Promise<unknown>,
  ) {
    setChanging(kind);
    try {
      await savePrompt.flush();
      await operation();
    } finally {
      setChanging(null);
    }
  }
  const activate = (assetId: string) =>
    change("version", () => mutations.activateAsset(assetId));
  const remove = () =>
    change("remove", () =>
      mutations.replaceAssets(
        type,
        items.filter((a) => a.id !== asset?.id),
      ),
    );
  async function upload(file?: File) {
    if (file)
      await change("upload", () =>
        mutations.uploadAsset(type, asset?.sequenceInType ?? 0, file),
      );
  }
  async function generate() {
    if (!asset) return;
    setRegenerating(true);
    try {
      await savePrompt.flush();
      await onGenerate(asset);
    } finally {
      setRegenerating(false);
    }
  }
  const fieldLabel =
    type === "reference"
      ? "refImagePrompt"
      : type === "first_frame"
        ? "startFrameDesc"
        : "endFrameDesc";
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-[--border-subtle] bg-white">
      <AssetMedia
        shot={editor.shot}
        asset={asset}
        label={label}
        onPreview={onPreview}
        onActivate={activate}
        disabled={disabled}
      />
      <div className="space-y-2 p-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-primary">{label}</span>
          <AiOptimizeButton
            value={prompt}
            projectId={editor.projectId}
            fieldLabel={fieldLabel}
            images={asset?.fileUrl ? [asset.fileUrl] : undefined}
            onOptimized={(value) => {
              setPrompt(value);
              savePrompt(value);
              void savePrompt.flush();
            }}
          />
        </div>
        <Textarea
          aria-label={label}
          placeholder={type === "reference" ? t("shot.refImagePrompt") : label}
          value={prompt}
          rows={5}
          className="resize-y text-sm leading-relaxed"
          disabled={disabled}
          onChange={(e) => {
            setPrompt(e.target.value);
            if (asset) savePrompt(e.target.value);
          }}
          onBlur={() => {
            if (!asset && prompt.trim()) savePrompt(prompt);
            void savePrompt.flush();
          }}
        />
        {!!characters?.length && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-[--text-muted]">
              {t("shot.refChars")}:
            </span>
            {characters.map((character) => {
              const selected = asset?.characters?.includes(character.name);
              return (
                <button
                  key={character.id}
                  disabled={disabled || !asset}
                  aria-pressed={!!selected}
                  onClick={async () => {
                    await change("metadata", () =>
                      update({
                        characters: selected
                          ? asset!.characters!.filter(
                              (name) => name !== character.name,
                            )
                          : [...(asset?.characters ?? []), character.name],
                      }),
                    );
                  }}
                  className={`rounded-full border px-2 py-0.5 text-xs ${selected ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-[--surface] text-[--text-muted]"}`}
                >
                  {character.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 border-t border-[--border-subtle] pt-2">
          {type === "reference" && (
            <InlineModelPicker
              capability="image"
              value={
                asset?.modelProvider && asset.modelId
                  ? { providerId: asset.modelProvider, modelId: asset.modelId }
                  : null
              }
              onChange={async (model) => {
                await change("metadata", () =>
                  update({
                    modelProvider: model.providerId,
                    modelId: model.modelId,
                  }),
                );
              }}
            />
          )}
          <button
            disabled={disabled}
            onClick={() => input.current?.click()}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-[--text-muted] hover:text-primary"
          >
            {changing === "upload" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            {t("common.upload")}
          </button>
          {type === "reference" && (
            <button
              disabled={disabled || !prompt.trim()}
              aria-label={t("shot.regenerateRefImages")}
              onClick={generate}
              className="ml-auto rounded p-1 text-[--text-muted] hover:text-primary disabled:opacity-30"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {asset && (
            <button
              disabled={disabled}
              aria-label={`${t("common.delete")} ${label}`}
              onClick={remove}
              className="rounded p-1 text-[--text-muted] hover:text-red-500 disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={`${t("common.upload")} ${label}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void upload(file);
            }}
          />
        </div>
      </div>
    </div>
  );
}
