"use client";

import { useTranslations } from "next-intl";
import { useDraft } from "@/hooks/use-draft";
import type { Shot } from "@/lib/editor-types";
import type { ShotMutations } from "@/hooks/use-shot-mutations";
import { TextField } from "./text-field";

export function DescriptionEditor({
  shot,
  projectId,
  onSave,
}: {
  shot: Shot;
  projectId: string;
  onSave: ShotMutations["updateShot"];
}) {
  const t = useTranslations();
  const [camera, setCamera] = useDraft(shot.cameraDirection);
  return (
    <div className="space-y-3">
      <TextField
        value={shot.prompt}
        label={t("shot.sceneDescription")}
        fieldLabel="sceneDescription"
        projectId={projectId}
        onSave={(prompt) => onSave({ prompt })}
      />
      <TextField
        value={shot.motionScript ?? ""}
        label={t("shot.motionScript")}
        fieldLabel="motionScript"
        projectId={projectId}
        onSave={(motionScript) => onSave({ motionScript })}
      />
      <label className="block space-y-1 text-xs text-[--text-muted]">
        <span>{t("shot.cameraDirection")}</span>
        <input
          value={camera}
          onChange={(e) => setCamera(e.target.value)}
          onBlur={() =>
            camera !== shot.cameraDirection &&
            onSave({ cameraDirection: camera })
          }
          className="w-full rounded-lg border border-[--border-subtle] bg-white px-3 py-2 text-sm text-[--text-primary]"
        />
      </label>
      {shot.dialogues.length > 0 && (
        <div className="space-y-1 rounded-lg bg-[--surface] p-3">
          <p className="text-xs text-[--text-muted]">{t("shot.dialogue")}</p>
          {shot.dialogues.map((d) => (
            <p key={d.id} className="text-sm">
              <span className="font-medium text-primary">
                {d.characterName}
              </span>{" "}
              — {d.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
