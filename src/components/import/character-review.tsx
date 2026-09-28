"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ImportedCharacter } from "@/lib/import-types";

export function CharacterReview({
  characters,
  onToggle,
  onConfirm,
}: {
  characters: ImportedCharacter[];
  onToggle?: (index: number) => void;
  onConfirm?: () => void;
}) {
  const t = useTranslations("import");
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-[--text-primary]">
          {t("reviewCharacters")} ({characters.length})
        </h3>
        {onConfirm && (
          <Button onClick={onConfirm} className="rounded-xl">
            {t("confirmAndSplit")}
          </Button>
        )}
      </div>
      {onToggle && (
        <p className="text-sm text-[--text-muted]">
          {t("reviewCharactersHint")}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {characters.map((char, idx) => (
          <div
            key={idx}
            className="group relative overflow-hidden rounded-[14px] border border-[--border-subtle] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 hover:border-[--border-hover]"
          >
            {/* Top accent strip */}
            <div
              className={`h-1 w-full ${char.scope === "main" ? "bg-gradient-to-r from-blue-500 to-blue-400" : "bg-gradient-to-r from-purple-500 to-purple-400"}`}
            />
            <div className="p-3.5">
              {/* Avatar + Name */}
              <div className="mb-2.5 flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold text-white"
                  style={{
                    background: `linear-gradient(135deg, hsl(${(char.name.charCodeAt(0) * 37) % 360}, 45%, 45%), hsl(${(char.name.charCodeAt(0) * 37) % 360}, 50%, 55%))`,
                  }}
                >
                  {char.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-[--text-primary]">
                    {char.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[--text-muted]">
                    <span>
                      {t("frequency")} {char.frequency}
                    </span>
                    {char.visualHint && (
                      <>
                        <span className="h-[3px] w-[3px] rounded-full bg-[#ddd]" />
                        <span className="truncate">{char.visualHint}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {/* Visual hint tag */}
              {char.visualHint && (
                <div className="mb-2 inline-block rounded-md bg-[--surface] px-2 py-0.5 text-[10px] font-medium text-[--text-muted]">
                  {char.visualHint}
                </div>
              )}
              {/* Description */}
              <p className="line-clamp-2 text-[11px] leading-relaxed text-[--text-muted]">
                {char.description}
              </p>
            </div>
            {/* Scope badge (floating, clickable) */}
            <button
              disabled={!onToggle}
              onClick={() => onToggle?.(idx)}
              className={`absolute right-3 top-3 rounded-[8px] px-2 py-0.5 text-[9px] font-bold tracking-wide transition-colors ${
                char.scope === "main"
                  ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                  : "bg-purple-50 text-purple-600 hover:bg-purple-100"
              }`}
            >
              {char.scope === "main" ? t("main") : t("guest")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
