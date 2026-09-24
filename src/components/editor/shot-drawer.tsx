"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Shot } from "@/lib/editor-types";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShotCard } from "./shot-card";
import type { ShotEditorProps } from "./shot-editor/types";

interface ShotDrawerProps extends Omit<ShotEditorProps, "shot"> {
  shots: Shot[];
  openShotId: string;
  onClose: () => void;
  onShotChange: (id: string) => void;
}
export function ShotDrawer({
  shots,
  openShotId,
  onClose,
  onShotChange,
  ...editor
}: ShotDrawerProps) {
  const index = shots.findIndex((shot) => shot.id === openShotId);
  const shot = shots[index];
  if (!shot) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-label={`Shot ${shot.sequence}`}
        showCloseButton={false}
        className="top-0 right-0 left-auto flex h-dvh w-[640px] max-w-[95vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-[95vw]"
      >
        <DialogTitle className="sr-only">Shot {shot.sequence}</DialogTitle>
        <div className="flex shrink-0 items-center gap-2 border-b border-[--border-subtle] p-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {shot.sequence}. {shot.prompt}
          </p>
          <button
            aria-label="Previous shot"
            disabled={index === 0}
            onClick={() => onShotChange(shots[index - 1].id)}
            className="rounded-lg p-1 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Next shot"
            disabled={index === shots.length - 1}
            onClick={() => onShotChange(shots[index + 1].id)}
            className="rounded-lg p-1 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <DialogClose aria-label="Close editor" className="rounded-lg p-1">
            <X className="h-4 w-4" />
          </DialogClose>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <ShotCard key={shot.id} {...editor} shot={shot} expanded />
        </div>
      </DialogContent>
    </Dialog>
  );
}
