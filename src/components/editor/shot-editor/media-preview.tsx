"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { uploadUrl } from "@/lib/utils/upload-url";

export interface Media {
  url: string;
  kind: "image" | "video";
  label: string;
}

export function MediaPreview({
  media,
  onClose,
}: {
  media: Media;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-label={media.label}
        showCloseButton={false}
        className="flex w-auto max-w-[90vw] items-center justify-center border-0 bg-transparent p-0 shadow-none sm:max-w-[90vw]"
      >
        <DialogTitle className="sr-only">{media.label}</DialogTitle>
        {media.kind === "video" ? (
          <video
            src={uploadUrl(media.url)}
            controls
            autoPlay
            className="max-h-[85vh] max-w-full rounded-xl"
          />
        ) : (
          <img
            src={uploadUrl(media.url)}
            alt={media.label}
            className="max-h-[85vh] max-w-full rounded-xl"
          />
        )}
        <DialogClose
          aria-label="Close preview"
          className="absolute -right-3 -top-3 rounded-full bg-white p-2 shadow"
        >
          <X className="h-4 w-4" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
