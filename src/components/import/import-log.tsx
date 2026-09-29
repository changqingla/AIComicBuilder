"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportLog as LogEntry, ImportStep } from "@/lib/import-types";
import { CharacterReview } from "./character-review";
import { EpisodeReview } from "./episode-review";
import { IMPORT_STEPS } from "./import-steps";

export function ImportLog({
  logs,
  selectedStep,
  historyMode,
  canRetry,
  onShowAll,
  onRetry,
  onReset,
}: {
  logs: LogEntry[];
  selectedStep: ImportStep | null;
  historyMode: boolean;
  canRetry: boolean;
  onShowAll: () => void;
  onRetry: () => void;
  onReset: () => void;
}) {
  const t = useTranslations("import");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, selectedStep]);
  const filtered = selectedStep
    ? logs.filter((log) => log.step === selectedStep)
    : logs;
  const metadata = filtered.findLast((log) => log.status === "done")?.metadata;
  const characters =
    logs.findLast((log) => log.step === 2 && log.status === "done")?.metadata
      ?.characters ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-sm font-semibold text-[var(--text-secondary)]">
          {t("processLog")}
          {selectedStep && (
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              — {t(IMPORT_STEPS[selectedStep - 1].label)}
            </span>
          )}
        </h3>
        {selectedStep && (
          <button
            onClick={onShowAll}
            className="text-xs text-primary hover:underline"
          >
            {t("showAll")}
          </button>
        )}
      </div>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4">
        <div className="max-h-[30vh] space-y-1.5 overflow-y-auto font-mono text-xs">
          {filtered.map((log) => (
            <div key={log.id} className="flex items-start gap-2">
              <span
                className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${log.status === "done" ? "bg-emerald-500" : log.status === "error" ? "bg-red-500" : "bg-amber-400"}`}
              />
              {!selectedStep && (
                <span className="shrink-0 text-[var(--text-muted)]">
                  [Step {log.step}]
                </span>
              )}
              <span
                className={`min-w-0 break-words ${log.status === "error" ? "text-red-500" : "text-[var(--text-primary)]"}`}
              >
                {log.message}
              </span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
      {canRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
          {t("retry")}
        </Button>
      )}
      {selectedStep === 2 && metadata?.characters && (
        <CharacterReview characters={metadata.characters} />
      )}
      {selectedStep === 3 && metadata?.episodes && (
        <EpisodeReview episodes={metadata.episodes} characters={characters} />
      )}
      {historyMode && (
        <Button variant="outline" size="sm" onClick={onReset}>
          {t("newImport")}
        </Button>
      )}
    </section>
  );
}
