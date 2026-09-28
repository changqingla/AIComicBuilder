"use client";

import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  FileText,
  Layers,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import type { ImportStep, ImportStepStatus } from "@/lib/import-types";

export const IMPORT_STEPS = [
  { num: 1, icon: FileText, label: "importStep.parse" },
  { num: 2, icon: Users, label: "importStep.characters" },
  { num: 3, icon: Layers, label: "importStep.split" },
  { num: 4, icon: Sparkles, label: "importStep.generate" },
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
  const stepIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "done":
        return <Check className="h-4 w-4" />;
      case "error":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const stepColor = (status: string, selected: boolean) => {
    const base = (() => {
      switch (status) {
        case "running":
          return "border-primary/30 bg-primary/5 text-primary";
        case "done":
          return "border-transparent bg-[--surface] text-[--text-primary]";
        case "error":
          return "border-red-300 bg-red-50 text-red-500";
        default:
          return "border-transparent bg-[--surface] text-[--text-muted]";
      }
    })();
    if (selected)
      return (
        base + " !bg-primary/10 !border-primary/40 !text-primary shadow-sm"
      );
    return base;
  };

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
      {IMPORT_STEPS.map(({ num, icon: Icon, label }) => {
        const isClickable = historyMode && status[num] !== "idle";
        const isSelected = selectedStep === num;
        return (
          <button
            key={num}
            disabled={!isClickable}
            onClick={() => isClickable && onSelect(isSelected ? null : num)}
            className={`relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${stepColor(status[num], isSelected)} ${isClickable ? "cursor-pointer hover:bg-primary/5" : ""}`}
          >
            {/* Left accent bar for selected */}
            {isSelected && (
              <div className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
            )}
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                status[num] === "done"
                  ? isSelected
                    ? "bg-primary/15 text-primary"
                    : "bg-emerald-100 text-emerald-600"
                  : status[num] === "running"
                    ? "bg-primary/15"
                    : status[num] === "error"
                      ? "bg-red-100"
                      : "bg-white"
              }`}
            >
              {stepIcon(status[num]) || <Icon className="h-4 w-4" />}
            </div>
            <span className="text-sm font-medium">{t(label)}</span>
          </button>
        );
      })}
    </div>
  );
}
