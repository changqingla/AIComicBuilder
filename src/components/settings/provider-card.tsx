"use client";

import { X, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Provider } from "@/stores/model-store";
import { cn } from "@/lib/utils";

export function ProviderCard({
  provider,
  selected,
  onSelect,
  onDelete,
}: {
  provider: Provider;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("common");
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-md border bg-white",
        selected ? "border-primary/40 bg-accent/40" : "border-border",
      )}
    >
      <button
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-w-0 items-center gap-3 px-3 py-2.5 text-left"
      >
        <Server className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {provider.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {provider.protocol}
          </span>
        </span>
      </button>
      <button
        onClick={onDelete}
        aria-label={`${t("delete")} ${provider.name}`}
        className="mr-1 rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
