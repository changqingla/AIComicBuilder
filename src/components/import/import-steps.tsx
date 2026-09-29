"use client";

import { useTranslations } from "next-intl";

import type { ImportStep, ImportStepStatus } from "@/lib/import-types";
import { cn } from "@/lib/utils";

export const IMPORT_STEPS = [
  { num: 1, label: "importStep.parse" },
  { num: 2, label: "importStep.characters" },
  { num: 3, label: "importStep.split" },
  { num: 4, label: "importStep.generate" },
] as const;

export function ImportSteps({
  status,
  historyMode,
  selectedStep,
  onSelect,
}: {
  status: ImportStepStatus;
  historyMode: boolean;
  selectedStep: ImportStep | null;
  onSelect: (step: ImportStep | null) => void;
}) {
  const t = useTranslations("import");
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border">
      {IMPORT_STEPS.map(({ num, label }) => {
        const current = status[num];
        const selected = selectedStep === num;
        return (
          <button
            key={num}
            disabled={!historyMode || current === "idle"}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : num)}
            className={cn(
              "-mb-px flex min-w-0 items-center gap-2 border-b-2 border-transparent py-4 text-left text-sm text-muted-foreground",
              current === "done" && "text-foreground",
              (selected || current === "running") &&
                "border-foreground text-foreground",
              current === "error" && "text-destructive",
            )}
          >
            <span>{t(label)}</span>
          </button>
        );
      })}
    </div>
  );
}
