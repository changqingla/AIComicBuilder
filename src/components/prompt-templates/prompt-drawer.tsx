"use client";
import { useDraft } from "@/hooks/use-draft";
import { fetchJson } from "@/lib/api-fetch";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getModelMaxDuration } from "@/lib/ai/model-limits";
import { apiFetch } from "@/lib/api-fetch";
import { useModelStore } from "@/stores/model-store";
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
        className="!fixed !top-0 !right-0 !left-auto !translate-x-0 !translate-y-0 !max-w-[800px] !w-full !h-dvh !max-h-dvh !rounded-none !p-0 flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t("editor.edit")}</DialogTitle>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
          <p className="text-base font-medium">{headerTitle}</p>
          <div className="toolbar">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges()}
            >
              {t("editor.save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {tw("close")}
            </Button>
          </div>
        </div>
        {loading ? (
          <p className="p-7 text-sm text-muted-foreground">
            {t("editor.edit")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
            <div className="grid gap-4 border-b border-border py-5 sm:grid-cols-2">
              <label className="min-w-0 space-y-2 text-sm text-muted-foreground">
                <span>{t("title")}</span>
                <select
                  aria-label={t("title")}
                  value={selectedPromptKey ?? ""}
                  className="block h-10 w-full border border-input bg-white px-2 text-foreground"
                  onChange={(event) => {
                    const prompt = prompts.find(
                      (item) => item.key === event.target.value,
                    );
                    if (!prompt) return;
                    setSelectedPromptKey(prompt.key);
                    const slot =
                      prompt.slots.find((item) => item.editable) ??
                      prompt.slots[0];
                    setSelectedSlot(
                      slot
                        ? { promptKey: prompt.key, slotKey: slot.key }
                        : null,
                    );
                  }}
                >
                  {prompts.map((prompt) => (
                    <option key={prompt.key} value={prompt.key}>
                      {t(tKey(prompt.nameKey) as Parameters<typeof t>[0])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 space-y-2 text-sm text-muted-foreground">
                <span>{t("editor.slots")}</span>
                <select
                  aria-label={t("editor.slots")}
                  value={selectedSlot?.slotKey ?? ""}
                  className="block h-10 w-full border border-input bg-white px-2 text-foreground"
                  onChange={(event) => {
                    if (selectedPromptKey)
                      setSelectedSlot({
                        promptKey: selectedPromptKey,
                        slotKey: event.target.value,
                      });
                  }}
                >
                  {prompts
                    .find((prompt) => prompt.key === selectedPromptKey)
                    ?.slots.map((slot) => (
                      <option key={slot.key} value={slot.key}>
                        {t(tKey(slot.nameKey) as Parameters<typeof t>[0])}
                        {!slot.editable ? ` (${t("editor.locked")})` : ""}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {selectedSlot && currentSlotMeta && (
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
                onChange={(event) => {
                  if (!currentSlotMeta.editable) return;
                  setSlotContents((previous) => ({
                    ...previous,
                    [selectedSlot.promptKey]: {
                      ...previous[selectedSlot.promptKey],
                      [selectedSlot.slotKey]: event.target.value,
                    },
                  }));
                }}
                className="editor-textarea min-h-60 flex-1 resize-none py-5"
                placeholder={t("editor.edit")}
              />
            )}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">
                {hasUnsavedChanges()
                  ? t("editor.unsavedChanges")
                  : isProject
                    ? t("project.useProjectPrompts")
                    : ""}
              </span>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                {t("editor.resetDefault")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
