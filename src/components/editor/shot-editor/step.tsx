"use client";

import { useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function EditorStep({
  label,
  done,
  generating,
  failed,
  next,
  expanded,
  children,
  action,
  actionLabel,
  disabled,
}: {
  label: string;
  done: boolean;
  generating: boolean;
  failed?: boolean;
  next?: boolean;
  expanded?: boolean;
  children: ReactNode;
  action: () => void;
  actionLabel: string;
  disabled: boolean;
}) {
  const t = useTranslations();
  const [override, setOpen] = useState<boolean | null>(null);
  const open = override ?? (expanded || next);
  const Icon = generating
    ? Loader2
    : done
      ? CheckCircle2
      : failed
        ? XCircle
        : Circle;
  return (
    <div
      className={`rounded-xl border ${next ? "border-primary/30 bg-primary/3" : "border-[--border-subtle] bg-[--surface]/30"}`}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={!!open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <Icon
          className={`h-4 w-4 shrink-0 ${generating ? "animate-spin text-primary" : done ? "text-emerald-500" : failed ? "text-destructive" : "text-[--text-muted]"}`}
        />
        <span className="flex-1 text-sm font-medium">{label}</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t border-[--border-subtle] p-3">
          {children}
          <Button
            size="xs"
            variant={next ? "default" : "outline"}
            onClick={action}
            disabled={disabled}
          >
            {generating && <Loader2 className="h-3 w-3 animate-spin" />}
            {generating ? t("common.generating") : actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
