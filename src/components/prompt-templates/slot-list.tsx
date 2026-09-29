"use client";

import { usePromptTemplateStore } from "@/stores/prompt-template-store";
import { useTranslations } from "next-intl";

function tKey(nameKey: string): string {
  return nameKey.replace(/^promptTemplates\./, "");
}

export function SlotList() {
  const t = useTranslations("promptTemplates");
  const {
    registry,
    selectedPromptKey,
    selectedSlotKey,
    selectSlot,
    editedSlots,
    serverOverrides,
  } = usePromptTemplateStore();

  const prompt = registry.find((r) => r.key === selectedPromptKey);
  if (!prompt) return null;

  const editableSlots = prompt.slots.filter((s) => s.editable);
  const lockedSlots = prompt.slots.filter((s) => !s.editable);

  const isSlotModified = (slotKey: string) => {
    return (
      !!editedSlots[prompt.key]?.[slotKey] ||
      !!serverOverrides[prompt.key]?.[slotKey]
    );
  };

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="mb-1 px-2 text-xs font-semibold  text-[var(--text-muted)]">
        {t("editor.slots")} ({prompt.slots.length})
      </div>

      {editableSlots.map((slot) => {
        const isSelected = selectedSlotKey === slot.key;
        const modified = isSlotModified(slot.key);

        return (
          <button
            key={slot.key}
            onClick={() => selectSlot(slot.key)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-all duration-200 ${
              isSelected
                ? "border-l-2 border-foreground bg-muted text-[var(--text-primary)]"
                : "border-l-2 border-transparent hover:bg-muted text-[var(--text-secondary)]"
            }`}
          >
            <span className="flex-1 truncate">
              {t(tKey(slot.nameKey) as Parameters<typeof t>[0]) || slot.key}
            </span>
            {modified && (
              <span className="text-xs text-muted-foreground">
                {t("editor.modified")}
              </span>
            )}
          </button>
        );
      })}

      {lockedSlots.length > 0 && (
        <>
          <div className="my-1 border-t border-[var(--border-subtle)]" />
          {lockedSlots.map((slot) => {
            const isSelected = selectedSlotKey === slot.key;
            return (
              <button
                key={slot.key}
                onClick={() => selectSlot(slot.key)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-all duration-200 ${
                  isSelected
                    ? "border-l-2 border-foreground bg-muted text-foreground"
                    : "border-l-2 border-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="flex-1 truncate">
                  {t(tKey(slot.nameKey) as Parameters<typeof t>[0]) || slot.key}
                </span>
                <span className="shrink-0 text-xs">{t("editor.locked")}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
