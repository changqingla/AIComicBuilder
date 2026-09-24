"use client";

import { Film } from "lucide-react";
import type { Shot } from "@/lib/editor-types";
import { ShotCard, type ShotCardProps } from "../shot-card";

export function ShotList({
  shots,
  ...editor
}: Omit<ShotCardProps, "shot"> & { shots: Shot[] }) {
  const groups = new Map<string, Shot[]>();
  const ungrouped: Shot[] = [];
  for (const shot of shots) {
    if (!shot.sceneId) ungrouped.push(shot);
    else groups.set(shot.sceneId, [...(groups.get(shot.sceneId) ?? []), shot]);
  }
  const render = (shot: Shot) => (
    <ShotCard key={shot.id} shot={shot} {...editor} />
  );
  if (!groups.size) return <div className="space-y-3">{shots.map(render)}</div>;
  return (
    <div className="space-y-6">
      {[...groups].map(([sceneId, members], index) => (
        <div key={sceneId} className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2 pt-4">
            <Film className="h-4 w-4 text-[--text-muted]" />
            <h3 className="text-sm font-medium">Scene {index + 1}</h3>
            <span className="text-xs text-[--text-muted]">
              {members.length} shots
            </span>
          </div>
          {members.map(render)}
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div className="space-y-3">
          <h3 className="border-b pb-2 text-sm text-[--text-muted]">
            Other Shots
          </h3>
          {ungrouped.map(render)}
        </div>
      )}
    </div>
  );
}
