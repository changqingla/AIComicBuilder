"use client";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  getReferenceAssets,
  selectAsset,
  type ShotAsset,
} from "@/lib/shot-assets";
import { useShotMutations } from "@/hooks/use-shot-mutations";
import { ImageAssetEditor } from "./image-asset-editor";
import type { ShotEditorProps } from "./types";
import type { Media } from "./media-preview";

export function ImageAssets({
  editor,
  busy,
  onGenerate,
  onPreview,
}: {
  editor: ShotEditorProps;
  busy: boolean;
  onGenerate: (asset: ShotAsset) => Promise<void>;
  onPreview: (media: Media) => void;
}) {
  const t = useTranslations();
  const { replaceAssets } = useShotMutations(
    editor.projectId,
    editor.shot.id,
    editor.onUpdate,
  );
  const refs = getReferenceAssets(editor.shot);
  function addReference() {
    const sequenceInType =
      Math.max(
        -1,
        ...editor.shot.assets
          .filter((a) => a.type === "reference")
          .map((a) => a.sequenceInType),
      ) + 1;
    return replaceAssets("reference", [
      ...refs,
      { sequenceInType, prompt: "" },
    ]);
  }
  return (
    <div className="space-y-2">
      {editor.generationMode === "reference" ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {refs.map((asset, index) => (
              <ImageAssetEditor
                key={asset.id}
                editor={editor}
                asset={asset}
                type="reference"
                label={
                  asset.meta?.sceneName || `${t("shot.scene")} ${index + 1}`
                }
                busy={busy}
                onGenerate={onGenerate}
                onPreview={onPreview}
              />
            ))}
          </div>
          {!refs.length && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-[--text-muted]">
              {t("shot.noRefImages")}
            </p>
          )}
          {refs.length < 9 && (
            <button
              disabled={busy}
              onClick={addReference}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs text-[--text-muted] hover:text-primary disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              {t("shot.addRefImage")}
            </button>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(["first_frame", "last_frame"] as const).map((type) => {
            const asset = selectAsset(editor.shot.assets, type);
            return (
              <ImageAssetEditor
                key={asset?.id ?? type}
                editor={editor}
                asset={asset}
                type={type}
                label={t(
                  type === "first_frame" ? "shot.startFrame" : "shot.endFrame",
                )}
                busy={busy}
                onGenerate={onGenerate}
                onPreview={onPreview}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
