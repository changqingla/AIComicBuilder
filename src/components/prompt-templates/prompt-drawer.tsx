"use client";
import { useDraft } from "@/hooks/use-draft";
import { fetchJson } from "@/lib/api-fetch";
import useSWR, { useSWRConfig } from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getModelMaxDuration } from "@/lib/ai/model-limits";
import { apiFetch } from "@/lib/api-fetch";
import { useModelStore } from "@/stores/model-store";
import { Lock, RotateCcw, Save, FileText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────

interface SlotMeta {
  key: string;
  nameKey: string;
  descriptionKey: string;
  defaultContent: string;
  editable: boolean;
}

interface PromptMeta {
  key: string;
  nameKey: string;
  descriptionKey: string;
  category: string;
  slots: SlotMeta[];
}

interface ServerOverride {
  promptKey: string;
  slotKey: string | null;
  content: string;
}

function tKey(nameKey: string): string {
  return nameKey.replace(/^promptTemplates\./, "");
}

// ── Props ────────────────────────────────────────────────

interface PromptDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One or more prompt keys to edit */
  promptKeys: string | string[];
  /** Project-scoped editing */
  projectId?: string;
}

const EMPTY_CONTENTS: Record<string, Record<string, string>> = {};

export function PromptDrawer({
  open,
  onOpenChange,
  promptKeys: rawKeys,
  projectId,
}: PromptDrawerProps) {
  const t = useTranslations("promptTemplates");
  const tw = useTranslations("workspace");
  const promptKeys = Array.isArray(rawKeys) ? rawKeys : [rawKeys];

  const [saving, setSaving] = useState(false);

  const defaultVideoModel = useModelStore((s) => s.defaultVideoModel);
  const videoMaxDuration = getModelMaxDuration(defaultVideoModel?.modelId);
  const videoMinDuration = Math.min(8, videoMaxDuration);

  function resolvePlaceholders(content: string): string {
    const durationRange =
      videoMinDuration === videoMaxDuration
        ? String(videoMaxDuration)
        : `${videoMinDuration}-${videoMaxDuration}`;
    return content
      .replace(/\{\{MIN_DURATION\}\}-\{\{MAX_DURATION\}\}/g, durationRange)
      .replace(/\{\{MIN_DURATION\}\}/g, String(videoMinDuration))
      .replace(/\{\{MAX_DURATION\}\}/g, String(videoMaxDuration))
      .replace(/\{\{DIALOGUE_MAX\}\}/g, String(Math.min(videoMaxDuration, 12)))
      .replace(/\{\{ACTION_MAX\}\}/g, String(Math.min(videoMaxDuration, 12)))
      .replace(
        /\{\{ESTABLISHING_MAX\}\}/g,
        String(Math.min(videoMaxDuration, 10)),
      );
  }

  const isProject = !!projectId;
  const templatesBasePath = isProject
    ? `/api/projects/${projectId}/prompt-templates`
    : "/api/prompt-templates";

  const cacheKey = [templatesBasePath, promptKeys.join(",")] as const;
  const { mutate } = useSWRConfig();
  const { data, isLoading: loading } = useSWR(
    open ? cacheKey : null,
    async ([basePath, keys]) => {
      const [registry, overrides] = await Promise.all([
        fetchJson<PromptMeta[]>("/api/prompt-templates/registry"),
        fetchJson<ServerOverride[]>(basePath),
      ]);
      const prompts = keys
        .split(",")
        .map((key) => registry.find((prompt) => prompt.key === key))
        .filter((prompt) => !!prompt);
      const server: Record<string, Record<string, string>> = {};
      const contents: Record<string, Record<string, string>> = {};
      for (const prompt of prompts) {
        server[prompt.key] = Object.fromEntries(
          overrides
            .filter((row) => row.promptKey === prompt.key && row.slotKey)
            .map((row) => [row.slotKey!, row.content]),
        );
        contents[prompt.key] = Object.fromEntries(
          prompt.slots.map((slot) => [
            slot.key,
            server[prompt.key][slot.key] ?? slot.defaultContent,
          ]),
        );
      }
      const first = prompts[0];
      const slot = first?.slots.find((slot) => slot.editable);
      return {
        prompts,
        server,
        contents,
        promptKey: first?.key ?? null,
        slot:
          first && slot ? { promptKey: first.key, slotKey: slot.key } : null,
      };
    },
    {
      revalidateOnFocus: false,
      onError: () => toast.error("Failed to load prompt data"),
    },
  );
  const prompts = data?.prompts ?? [];
  const [selectedPromptKey, setSelectedPromptKey] = useDraft(
    data?.promptKey ?? null,
  );
  const [selectedSlot, setSelectedSlot] = useDraft(data?.slot ?? null);
  const [slotContents, setSlotContents] = useDraft(
    data?.contents ?? EMPTY_CONTENTS,
    { preserveUnsaved: true },
  );
  const serverOverrides = data?.server ?? EMPTY_CONTENTS;

  if (prompts.length === 0 && !loading) return null;

  const currentSlotMeta = selectedSlot
    ? prompts
        .find((p) => p.key === selectedSlot.promptKey)
        ?.slots.find((s) => s.key === selectedSlot.slotKey)
    : null;

  const isModified = (promptKey: string, slotKey: string) => {
    const prompt = prompts.find((p) => p.key === promptKey);
    const slot = prompt?.slots.find((s) => s.key === slotKey);
    if (!slot) return false;
    return (slotContents[promptKey]?.[slotKey] ?? "") !== slot.defaultContent;
  };

  const hasUnsavedChanges = () => {
    for (const prompt of prompts) {
      for (const slot of prompt.slots.filter((s) => s.editable)) {
        const serverValue =
          serverOverrides[prompt.key]?.[slot.key] ?? slot.defaultContent;
        if ((slotContents[prompt.key]?.[slot.key] ?? "") !== serverValue)
          return true;
      }
    }
    return false;
  };

  // Title: single prompt shows its name; multiple shows generic
  const headerTitle =
    prompts.length === 1
      ? t(tKey(prompts[0].nameKey) as Parameters<typeof t>[0])
      : t("title");

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isProject) {
        await apiFetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useProjectPrompts: 1 }),
        });
      }

      // Save each prompt's changed slots
      for (const prompt of prompts) {
        const slots: Record<string, string> = {};
        for (const slot of prompt.slots.filter((s) => s.editable)) {
          const current = slotContents[prompt.key]?.[slot.key] ?? "";
          if (
            current !== slot.defaultContent ||
            serverOverrides[prompt.key]?.[slot.key]
          ) {
            slots[slot.key] = current;
          }
        }
        if (Object.keys(slots).length > 0) {
          await apiFetch(`${templatesBasePath}/${prompt.key}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "slots", slots }),
          });
        }
      }

      // Refresh overrides
      const resp = await apiFetch(templatesBasePath);
      const overData: ServerOverride[] = await resp.json();
      const overMap: Record<string, Record<string, string>> = {};
      for (const prompt of prompts) {
        overMap[prompt.key] = {};
        for (const o of overData) {
          if (o.promptKey === prompt.key && o.slotKey) {
            overMap[prompt.key][o.slotKey] = o.content;
          }
        }
      }
      await mutate(
        cacheKey,
        { ...data, server: overMap, contents: slotContents },
        { revalidate: false },
      );
      toast.success(t("editor.savedSuccess"));
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      for (const prompt of prompts) {
        await apiFetch(`${templatesBasePath}/${prompt.key}`, {
          method: "DELETE",
        });
      }
      const contents: Record<string, Record<string, string>> = {};
      for (const prompt of prompts) {
        contents[prompt.key] = {};
        for (const slot of prompt.slots) {
          contents[prompt.key][slot.key] = slot.defaultContent;
        }
      }
      setSlotContents(contents);
      const emptyOverrides: Record<string, Record<string, string>> = {};
      for (const prompt of prompts) emptyOverrides[prompt.key] = {};
      await mutate(
        cacheKey,
        { ...data, server: emptyOverrides, contents },
        { revalidate: false },
      );
      toast.success(t("editor.resetSuccess"));
    } catch {
      toast.error("Reset failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!fixed !top-0 !right-0 !left-auto !translate-x-0 !translate-y-0 !max-w-[1100px] !w-full !h-dvh !max-h-dvh !rounded-none !p-0 flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t("editor.edit")}</DialogTitle>

        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <FileText className="size-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {headerTitle}
              </div>
            </div>
            {isProject && (
              <Badge variant="default" className="text-xs">
                {t("project.useProjectPrompts")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="xs" variant="ghost" onClick={handleReset}>
              <RotateCcw className="h-3 w-3" />
              {t("editor.resetDefault")}
            </Button>
            <Button
              size="xs"
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges()}
            >
              <Save className="h-3 w-3" />
              {t("editor.save")}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={tw("close")}
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-[var(--text-muted)] text-sm">
            Loading...
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[200px_170px_minmax(0,1fr)] lg:overflow-hidden">
            {/* Column 1: Prompt list, grouped by category (matches backend settings page) */}
            <div className="max-h-52 overflow-y-auto border-b border-border p-2 lg:max-h-none lg:border-r lg:border-b-0">
              {(() => {
                const grouped: Record<string, PromptMeta[]> = {};
                for (const p of prompts) {
                  if (!grouped[p.category]) grouped[p.category] = [];
                  grouped[p.category].push(p);
                }
                return Object.entries(grouped).map(([category, list]) => (
                  <div key={category}>
                    <div className="px-2 pb-1 pt-3 text-xs font-semibold  text-[var(--text-muted)]">
                      {t(`categories.${category}` as Parameters<typeof t>[0])}
                    </div>
                    {list.map((prompt) => {
                      const isSelected = selectedPromptKey === prompt.key;
                      const dirtyCount = prompt.slots.filter((s) =>
                        isModified(prompt.key, s.key),
                      ).length;
                      return (
                        <button
                          key={prompt.key}
                          onClick={() => {
                            setSelectedPromptKey(prompt.key);
                            const firstEditable = prompt.slots.find(
                              (s) => s.editable,
                            );
                            if (firstEditable) {
                              setSelectedSlot({
                                promptKey: prompt.key,
                                slotKey: firstEditable.key,
                              });
                            } else {
                              setSelectedSlot(null);
                            }
                          }}
                          className={`flex w-full flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left transition-all duration-200 ${
                            isSelected
                              ? "border border-primary/15 bg-primary/5"
                              : "border border-transparent hover:bg-[var(--surface)]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[13px] ${
                                isSelected
                                  ? "text-[var(--text-primary)] font-medium"
                                  : "text-[var(--text-secondary)]"
                              }`}
                            >
                              {t(
                                tKey(prompt.nameKey) as Parameters<typeof t>[0],
                              )}
                            </span>
                            {dirtyCount > 0 && (
                              <Badge
                                variant="default"
                                className="text-xs px-1 py-0"
                              >
                                {dirtyCount}
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>

            {/* Column 2: Slot list of selected prompt */}
            <div className="max-h-48 overflow-y-auto border-b border-border p-2 lg:max-h-none lg:border-r lg:border-b-0">
              {(() => {
                const prompt = prompts.find((p) => p.key === selectedPromptKey);
                if (!prompt) {
                  return (
                    <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)] px-2 text-center">
                      {t("editor.slotMode")}
                    </div>
                  );
                }
                const editableSlots = prompt.slots.filter((s) => s.editable);
                const lockedSlots = prompt.slots.filter((s) => !s.editable);
                return (
                  <>
                    <div className="mb-1 px-2 text-xs font-semibold  text-[var(--text-muted)]">
                      {t("editor.slots")} ({prompt.slots.length})
                    </div>
                    {editableSlots.map((slot) => {
                      const isSelected =
                        selectedSlot?.promptKey === prompt.key &&
                        selectedSlot?.slotKey === slot.key;
                      const modified = isModified(prompt.key, slot.key);
                      return (
                        <button
                          key={slot.key}
                          onClick={() =>
                            setSelectedSlot({
                              promptKey: prompt.key,
                              slotKey: slot.key,
                            })
                          }
                          className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs transition-all ${
                            isSelected
                              ? "border border-primary/15 bg-primary/5 text-[var(--text-primary)] font-medium"
                              : "border border-transparent hover:bg-[var(--surface)] text-[var(--text-secondary)]"
                          }`}
                        >
                          <span className="flex-1 truncate">
                            {t(tKey(slot.nameKey) as Parameters<typeof t>[0]) ||
                              slot.key}
                          </span>
                          {modified && (
                            <Badge
                              variant="default"
                              className="shrink-0 text-xs px-1 py-0"
                            >
                              {t("editor.modified")}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                    {lockedSlots.length > 0 && (
                      <>
                        <div className="my-1.5 border-t border-[var(--border-subtle)]" />
                        {lockedSlots.map((slot) => {
                          const isSelected =
                            selectedSlot?.promptKey === prompt.key &&
                            selectedSlot?.slotKey === slot.key;
                          return (
                            <button
                              key={slot.key}
                              onClick={() =>
                                setSelectedSlot({
                                  promptKey: prompt.key,
                                  slotKey: slot.key,
                                })
                              }
                              className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs transition-all ${
                                isSelected
                                  ? "border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-secondary)]"
                                  : "border border-transparent text-[var(--text-muted)] hover:bg-[var(--surface)] opacity-60 hover:opacity-80"
                              }`}
                            >
                              <Lock className="h-2.5 w-2.5 shrink-0" />
                              <span className="flex-1 truncate">
                                {t(
                                  tKey(slot.nameKey) as Parameters<typeof t>[0],
                                ) || slot.key}
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Column 3: Editor (right) */}
            <div className="flex min-h-[420px] min-w-0 flex-col lg:min-h-0">
              {selectedSlot && currentSlotMeta ? (
                <div className="flex min-h-0 flex-1 flex-col p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {t(
                        tKey(currentSlotMeta.nameKey) as Parameters<
                          typeof t
                        >[0],
                      )}
                    </span>
                    {!currentSlotMeta.editable && (
                      <Badge className="shrink-0 text-xs px-1.5 py-0 bg-[var(--surface)] text-[var(--text-muted)]">
                        {t("editor.locked")}
                      </Badge>
                    )}
                    {currentSlotMeta.editable &&
                      isModified(
                        selectedSlot.promptKey,
                        selectedSlot.slotKey,
                      ) && (
                        <Badge variant="warning" className="text-xs px-1 py-0">
                          {t("editor.modified")}
                        </Badge>
                      )}
                  </div>
                  <textarea
                    aria-label={t(
                      tKey(currentSlotMeta.nameKey) as Parameters<typeof t>[0],
                    )}
                    value={resolvePlaceholders(
                      slotContents[selectedSlot.promptKey]?.[
                        selectedSlot.slotKey
                      ] ?? "",
                    )}
                    readOnly={!currentSlotMeta.editable}
                    onChange={(e) => {
                      if (!currentSlotMeta.editable) return;
                      setSlotContents((prev) => ({
                        ...prev,
                        [selectedSlot.promptKey]: {
                          ...prev[selectedSlot.promptKey],
                          [selectedSlot.slotKey]: e.target.value,
                        },
                      }));
                    }}
                    className={`min-h-80 flex-1 resize-none rounded-md border border-border px-4 py-3 text-sm leading-7 lg:min-h-0 text-[var(--text-primary)] outline-none transition-all ${
                      currentSlotMeta.editable
                        ? "bg-white hover:border-[var(--border-hover)] focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                        : "bg-[var(--surface)] cursor-default"
                    }`}
                    placeholder={t("editor.edit")}
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-muted)]">
                  {t("editor.slotMode")}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
