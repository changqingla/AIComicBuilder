"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function EditorStep({
  label,
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
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={!!open}
        className="flex w-full items-center gap-2.5 py-4 text-left"
      >
        <span className="flex-1 text-sm font-medium">{label}</span>
        {generating && (
          <span role="status" className="text-xs text-muted-foreground">
            {t("common.generating")}
          </span>
        )}
        {failed && (
          <span className="text-xs text-destructive">
            {t("common.generationFailed")}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {t(open ? "workspace.collapse" : "workspace.expand")}
        </span>
      </button>
      {open && (
        <div className="space-y-4 pb-6">
          {children}
          <Button
            size="sm"
            variant={next ? "default" : "outline"}
            onClick={action}
            disabled={disabled}
          >
            {generating ? t("common.generating") : actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
