"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useShotGeneration } from "@/hooks/use-shot-generation";
import { useShotMutations } from "@/hooks/use-shot-mutations";
import {
  getFirstFrameUrl,
  getLastFrameUrl,
  getReferenceAssets,
  hasAllReferenceImages,
  hasKeyframePair,
  selectAsset,
} from "@/lib/shot-assets";
import { ShotHeader } from "./shot-editor/header";
import { DescriptionEditor } from "./shot-editor/description-editor";
import { ImageAssets } from "./shot-editor/image-assets";
import { AssetMedia } from "./shot-editor/asset-media";
import { MediaPreview, type Media } from "./shot-editor/media-preview";
import { TextField } from "./shot-editor/text-field";
import { EditorStep } from "./shot-editor/step";
import type { ShotEditorProps } from "./shot-editor/types";

export interface ShotCardProps extends ShotEditorProps {
  isCompact?: boolean;
  onOpenDrawer?: (id: string) => void;
  expanded?: boolean;
}
export function ShotCard({
  isCompact,
  onOpenDrawer,
  expanded,
  ...editor
}: ShotCardProps) {
  const t = useTranslations();
  const { shot, generationMode, projectId } = editor;
  const generation = useShotGeneration(editor);
  const mutations = useShotMutations(projectId, shot.id, editor.onUpdate);
  const [preview, setPreview] = useState<Media | null>(null);
  const reference = generationMode === "reference";
  const hasFrame = reference
    ? getReferenceAssets(shot).some((a) => a.fileUrl)
    : !!(getFirstFrameUrl(shot) || getLastFrameUrl(shot));
  const readyForVideo = reference
    ? hasAllReferenceImages(shot)
    : hasKeyframePair(shot);
  const video = selectAsset(
    shot.assets,
    reference ? "reference_video" : "keyframe_video",
  );
  const pending = generation.pending;
  const busy = !!(
    editor.disabled ||
    pending ||
    editor.batchGeneratingFrames ||
    editor.batchGeneratingVideoPrompts ||
    editor.batchGeneratingVideos ||
    shot.status === "generating"
  );
  const header = (
    <ShotHeader
      editor={editor}
      compact={isCompact}
      onOpen={onOpenDrawer ? () => onOpenDrawer(shot.id) : undefined}
      onPreview={setPreview}
    />
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-[--border-subtle] bg-white">
      {header}
      {!isCompact && (
        <div className="space-y-2 border-t border-[--border-subtle] px-4 pb-3 pt-3">
          <EditorStep
            label={t("shot.stepDesc")}
            done={!!shot.prompt}
            generating={pending === "text"}
            expanded={expanded}
            action={() => generation.run("text")}
            actionLabel={t("shot.rewriteText")}
            disabled={busy}
          >
            <DescriptionEditor
              shot={shot}
              projectId={projectId}
              onSave={mutations.updateShot}
            />
          </EditorStep>
          <EditorStep
            label={t(reference ? "shot.stepSceneFrame" : "shot.stepFrames")}
            done={hasFrame}
            generating={pending === "frames" || !!editor.batchGeneratingFrames}
            failed={shot.status === "failed" && !hasFrame}
            next={!hasFrame}
            expanded={expanded}
            action={() => generation.run("frames")}
            actionLabel={t(
              reference
                ? hasFrame
                  ? "shot.regenerateRefImages"
                  : "shot.generateRefImages"
                : hasFrame
                  ? "shot.regenerateFrames"
                  : "project.generateFrames",
            )}
            disabled={busy}
          >
            <ImageAssets
              editor={editor}
              busy={busy}
              onGenerate={(asset) => generation.run("frames", asset)}
              onPreview={setPreview}
            />
          </EditorStep>
          <EditorStep
            label={t("shot.stepVideoPrompt")}
            done={!!shot.videoPrompt}
            generating={
              pending === "prompt" || !!editor.batchGeneratingVideoPrompts
            }
            next={hasFrame && !shot.videoPrompt}
            expanded={expanded}
            action={() => generation.run("prompt")}
            actionLabel={t(
              shot.videoPrompt
                ? "shot.regeneratePrompt"
                : "shot.generateVideoPrompt",
            )}
            disabled={busy || !hasFrame}
          >
            <TextField
              value={shot.videoPrompt ?? ""}
              label={t("shot.stepVideoPrompt")}
              fieldLabel="videoPrompt"
              projectId={projectId}
              onSave={(videoPrompt) => mutations.updateShot({ videoPrompt })}
              rows={4}
            />
          </EditorStep>
          <EditorStep
            label={t("shot.stepVideo")}
            done={!!video?.fileUrl}
            generating={pending === "video" || !!editor.batchGeneratingVideos}
            failed={shot.status === "failed" && !video?.fileUrl}
            next={hasFrame && !!shot.videoPrompt && !video?.fileUrl}
            expanded={expanded}
            action={() => generation.run("video")}
            actionLabel={t(
              video?.fileUrl ? "shot.regenerateVideo" : "project.generateVideo",
            )}
            disabled={busy || !readyForVideo}
          >
            {video?.fileUrl && (
              <AssetMedia
                shot={shot}
                asset={video}
                label={t("shot.stepVideo")}
                onPreview={setPreview}
                onActivate={mutations.activateAsset}
                disabled={busy}
              />
            )}
          </EditorStep>
        </div>
      )}
      {preview && (
        <MediaPreview media={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
