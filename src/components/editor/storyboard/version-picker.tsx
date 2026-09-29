"use client";

import type { StoryboardVersion } from "@/lib/editor-types";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

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
  if (!versions.length) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <select
        aria-label={t("promptTemplates.versions.title")}
        value={selected ?? ""}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value)}
        className="h-9 min-w-0 max-w-full border-b border-border bg-transparent px-1 text-sm"
      >
        {!selected && (
          <option value="" disabled>
            {t("promptTemplates.versions.title")}
          </option>
        )}
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {version.label}
          </option>
        ))}
      </select>
      <Button size="sm" variant="ghost" onClick={onCreate} disabled={disabled}>
        {t("workspace.newVersion")}
      </Button>
    </div>
  );
}
