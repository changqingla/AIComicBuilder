"use client";

import { cn } from "@/lib/utils";
import type { Provider } from "@/stores/model-store";
import { useTranslations } from "next-intl";

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
        "flex min-w-0 items-center gap-1",
        selected ? "bg-muted" : "",
      )}
    >
      <button
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-w-0 items-center flex-1 gap-3 px-2 py-2.5 text-left"
      >
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
        className="p-2 text-xs text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
      >
        {t("delete")}
      </button>
    </div>
  );
}
