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
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading">
          {t("reviewCharacters")}{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {characters.length}
          </span>
        </h2>
        {onConfirm && (
          <Button onClick={onConfirm}>{t("confirmAndSplit")}</Button>
        )}
      </div>
      {onToggle && (
        <p className="text-sm text-muted-foreground">
          {t("reviewCharactersHint")}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {characters.map((character, index) => (
          <article key={index} className="workspace-panel p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{character.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("frequency")} {character.frequency}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!onToggle}
                aria-pressed={character.scope === "main"}
                onClick={() => onToggle?.(index)}
              >
                {t(character.scope === "main" ? "main" : "guest")}
              </Button>
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {character.description}
            </p>
            {character.visualHint && (
              <p className="mt-2 text-sm text-muted-foreground">
                {character.visualHint}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
