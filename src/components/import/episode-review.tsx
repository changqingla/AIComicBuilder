"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportedCharacter, ImportedEpisode } from "@/lib/import-types";

export function EpisodeReview({
  episodes,
  characters,
  onRename,
  onRemove,
  onConfirm,
}: {
  episodes: ImportedEpisode[];
  characters: ImportedCharacter[];
  onRename?: (index: number, title: string) => void;
  onRemove?: (index: number) => void;
  onConfirm?: () => void;
}) {
  const t = useTranslations("import");
  const common = useTranslations("common");
  const tw = useTranslations("workspace");
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-sans text-lg font-bold text-[var(--text-primary)]">
          {t("reviewEpisodes")} ({episodes.length})
        </h3>
        {onConfirm && (
          <Button
            onClick={onConfirm}
            disabled={!episodes.length}
            className="rounded-md"
          >
            {t("confirmAndGenerate")}
          </Button>
        )}
      </div>
      {onRename && (
        <p className="text-sm text-[var(--text-muted)]">
          {t("reviewEpisodesHint")}
        </p>
      )}
      <div className="space-y-3">
        {episodes.map((ep, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-[var(--border-subtle)] bg-white p-4"
          >
            <div className="mb-2 flex items-center gap-3">
              <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                EP.{String(idx + 1).padStart(2, "0")}
              </span>
              {onRename ? (
                <>
                  <Input
                    aria-label={`EP.${idx + 1}`}
                    value={ep.title}
                    onChange={(e) => onRename(idx, e.target.value)}
                    className="h-8 min-w-0 text-sm font-semibold"
                  />
                  <button
                    aria-label={`${common("delete")} ${idx + 1}`}
                    onClick={() => onRemove?.(idx)}
                    className="shrink-0 text-[var(--text-muted)] hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {ep.title}
                </span>
              )}
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              {ep.description}
            </p>
            {ep.idea && (
              <details className="mt-3 border-t border-border pt-3">
                <summary className="text-sm font-medium text-muted-foreground">
                  {tw("document")}
                </summary>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
                  {ep.idea}
                </p>
              </details>
            )}
            {ep.characters && ep.characters.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {ep.characters.map((name) => {
                  const isMain = characters.some(
                    (c) => c.name === name && c.scope === "main",
                  );
                  return (
                    <span
                      key={name}
                      className={`rounded px-2 py-1 text-xs font-medium ${isMain ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
            {ep.keywords && (
              <div className="mt-2 flex flex-wrap gap-1">
                {ep.keywords
                  .split(/[,，]/)
                  .map((kw) => kw.trim())
                  .filter(Boolean)
                  .map((kw) => (
                    <span
                      key={kw}
                      className="rounded bg-transparent px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {kw}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
