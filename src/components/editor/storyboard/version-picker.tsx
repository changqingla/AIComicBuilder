"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StoryboardVersion } from "@/lib/editor-types";

export function VersionPicker({
  versions,
  selected,
  onSelect,
  onCreate,
  disabled,
}: {
  versions: StoryboardVersion[];
  selected: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  disabled: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  if (!versions.length) return null;
  function select(id: string) {
    onSelect(id);
    setOpen(false);
  }
  function versionButton(version: StoryboardVersion) {
    return (
      <button
        key={version.id}
        disabled={disabled}
        onClick={() => select(version.id)}
        className={`rounded-lg px-3 py-1.5 text-sm disabled:opacity-40 ${selected === version.id ? "bg-primary/10 text-primary" : "text-[--text-muted] hover:bg-[--surface]"}`}
      >
        {version.label}
      </button>
    );
  }
  const older = versions.slice(2);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {versions.slice(0, 2).map(versionButton)}
      {older.length > 0 && (
        <div className="relative">
          <button
            disabled={disabled}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[--text-muted]"
          >
            {older.find((v) => v.id === selected)?.label ?? `+${older.length}`}
            <ChevronDown className="h-3 w-3" />
          </button>
          {open && (
            <div
              className="absolute right-0 top-full z-20 mt-1 flex min-w-36 flex-col rounded-xl border bg-white p-1 shadow-lg"
              onMouseLeave={() => setOpen(false)}
            >
              {older.map(versionButton)}
            </div>
          )}
        </div>
      )}
      <button
        onClick={onCreate}
        disabled={disabled}
        title={t("project.generateShots")}
        className="rounded-lg p-2 text-[--text-muted] disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
