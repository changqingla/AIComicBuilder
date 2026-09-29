"use client";

import type { Shot } from "@/lib/editor-types";
import { useTranslations } from "next-intl";
import { ShotCard, type ShotCardProps } from "../shot-card";

export function ShotList({
  shots,
  ...editor
}: Omit<ShotCardProps, "shot"> & { shots: Shot[] }) {
  const t = useTranslations();
  const groups = new Map<string, Shot[]>();
  const ungrouped: Shot[] = [];
  for (const shot of shots) {
    if (!shot.sceneId) ungrouped.push(shot);
    else groups.set(shot.sceneId, [...(groups.get(shot.sceneId) ?? []), shot]);
  }
  const render = (shot: Shot) => (
    <ShotCard key={shot.id} shot={shot} {...editor} />
  );
  if (!groups.size) return <div className="min-w-0">{shots.map(render)}</div>;
  return (
    <div className="space-y-6">
      {[...groups].map(([sceneId, members], index) => (
        <div key={sceneId} className="min-w-0">
          <div className="flex items-center gap-2 border-b pb-2 pt-4">
            <h3 className="text-sm font-medium">
              {t("shot.scene")} {index + 1}
            </h3>
            <span className="text-xs text-[var(--text-muted)]">
              {t("workspace.shotCount", { count: members.length })}
            </span>
          </div>
          {members.map(render)}
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div className="min-w-0">
          <h3 className="border-b pb-2 text-sm text-[var(--text-muted)]">
            {t("workspace.otherShots")}
          </h3>
          {ungrouped.map(render)}
        </div>
      )}
    </div>
  );
}
