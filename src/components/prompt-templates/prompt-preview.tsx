"use client";

import { useEffect, useRef, useState } from "react";
import { usePromptTemplateStore } from "@/stores/prompt-template-store";
import { apiFetch } from "@/lib/api-fetch";
import { useTranslations } from "next-intl";

export function PromptPreview() {
  const t = useTranslations("promptTemplates");
  const {
    selectedPromptKey,
    registry,
    getSlotContent,
    editedSlots,
    serverOverrides,
  } = usePromptTemplateStore();
  const [previewText, setPreviewText] = useState("");
  const [highlights, setHighlights] = useState<
    Record<string, "overridden" | "default">
  >({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prompt = registry.find((r) => r.key === selectedPromptKey);

  useEffect(() => {
    if (!prompt || !selectedPromptKey) {
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        // Build current slot values
        const slots: Record<string, string> = {};
        for (const slot of prompt.slots) {
          slots[slot.key] = getSlotContent(selectedPromptKey, slot.key);
        }

        const resp = await apiFetch("/api/prompt-templates/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptKey: selectedPromptKey, slots }),
        });
        const data = await resp.json();
        setPreviewText(data.fullPrompt ?? "");
        setHighlights(data.highlights ?? {});
      } catch {
        // silently ignore preview errors
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Trigger on slot content changes via editedSlots/serverOverrides
  }, [selectedPromptKey, prompt, getSlotContent, editedSlots, serverOverrides]);

  if (!prompt) return null;

  // Check if any slot is overridden
  const hasOverrides = Object.values(highlights).some(
    (v) => v === "overridden",
  );

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-xs font-semibold  text-[var(--text-muted)]">
        {t("editor.previewFull")}
      </div>
      <div
        className={`overflow-auto rounded-xl border border-[var(--border-subtle)] p-3 font-sans text-sm leading-7 whitespace-pre-wrap break-words ${
          hasOverrides
            ? "bg-primary/5"
            : "text-[var(--text-muted)] bg-[var(--surface)]"
        }`}
      >
        {previewText || (
          <span className="text-[var(--text-muted)] italic">
            {t("editor.preview")}...
          </span>
        )}
      </div>
    </div>
  );
}
