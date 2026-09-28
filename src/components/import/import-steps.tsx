"use client";

import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  FileText,
  Layers,
  Loader2,
  Users,
} from "lucide-react";
import type { ImportStep, ImportStepStatus } from "@/lib/import-types";
import { cn } from "@/lib/utils";

export const IMPORT_STEPS = [
  { num: 1, icon: FileText, label: "importStep.parse" },
  { num: 2, icon: Users, label: "importStep.characters" },
  { num: 3, icon: Layers, label: "importStep.split" },
  { num: 4, icon: Check, label: "importStep.generate" },
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
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
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
              "flex min-w-0 items-center gap-3 bg-white px-4 py-4 text-left text-sm text-muted-foreground transition-colors",
              current === "done" && "text-foreground",
              (selected || current === "running") && "bg-accent text-primary",
              current === "error" && "text-destructive",
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center font-mono text-xs"
            >
              {current === "running" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : current === "done" ? (
                <Check className="size-4" />
              ) : current === "error" ? (
                <AlertCircle className="size-4" />
              ) : (
                `0${num}`
              )}
            </span>
            <span className="font-medium">{t(label)}</span>
          </button>
        );
      })}
    </div>
  );
}
