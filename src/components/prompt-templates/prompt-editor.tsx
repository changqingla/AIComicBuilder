"use client";

import { Button } from "@/components/ui/button";
import { getModelMaxDuration } from "@/lib/ai/model-limits";
import { apiFetch } from "@/lib/api-fetch";
import { useModelStore } from "@/stores/model-store";
import { usePromptTemplateStore } from "@/stores/prompt-template-store";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdvancedEditor } from "./advanced-editor";
import { PresetDialog } from "./preset-dialog";
import { PromptPreview } from "./prompt-preview";
import { SlotList } from "./slot-list";

/** Strip "promptTemplates." prefix from registry nameKeys since t() is already scoped */
function tKey(nameKey: string): string {
  return nameKey.replace(/^promptTemplates\./, "");
}

interface PromptEditorProps {
  /** "global" or "project" — determines which API endpoints to use */
  scope?: "global" | "project";
  /** Required when scope="project" */
  projectId?: string;
  /** Auto-select this prompt on mount */
  initialPromptKey?: string;
}

export function PromptEditor({
  scope = "global",
  projectId,
  initialPromptKey,
}: PromptEditorProps) {
  const t = useTranslations("promptTemplates");
  const store = usePromptTemplateStore();
  const {
    registry,
    setRegistry,
    selectedPromptKey,
    selectedSlotKey,
    selectPrompt,
    mode,
    setMode,
    getSlotContent,
    setSlotContent,
    clearEdits,
    isDirty,
    setServerOverrides,
  } = store;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [projectPromptsEnabled, setProjectPromptsEnabled] = useState(false);

  const isProject = scope === "project" && !!projectId;

  // Build the correct API base path based on scope
  const templatesBasePath = isProject
    ? `/api/projects/${projectId}/prompt-templates`
    : "/api/prompt-templates";

  // Fetch registry + overrides on mount
  useEffect(() => {
    const init = async () => {
      try {
        const fetches: Promise<Response>[] = [
          apiFetch("/api/prompt-templates/registry"),
          apiFetch(templatesBasePath),
        ];
        if (isProject) {
          fetches.push(apiFetch(`/api/projects/${projectId}`));
        }
        const [regResp, overResp, projResp] = await Promise.all(fetches);
        const regData = await regResp.json();
        const overData = await overResp.json();
        setRegistry(regData);
        setServerOverrides(overData);
        if (projResp) {
          const projData = await projResp.json();
          setProjectPromptsEnabled(!!projData.useProjectPrompts);
        }

        // Auto-select prompt
        const autoKey =
          initialPromptKey || (regData.length > 0 ? regData[0].key : null);
        if (autoKey && !selectedPromptKey) {
          selectPrompt(autoKey);
        }
      } catch {
        toast.error("Failed to load prompt templates");
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, projectId]);

  // Group by category
  const grouped = registry.reduce<Record<string, typeof registry>>(
    (acc, prompt) => {
      if (!acc[prompt.category]) acc[prompt.category] = [];
      acc[prompt.category].push(prompt);
      return acc;
    },
    {},
  );

  const selectedPrompt = registry.find((r) => r.key === selectedPromptKey);
  const selectedSlot = selectedPrompt?.slots.find(
    (s) => s.key === selectedSlotKey,
  );
  const defaultVideoModel = useModelStore((s) => s.defaultVideoModel);
  const videoMaxDuration = getModelMaxDuration(defaultVideoModel?.modelId);
  const videoMinDuration = Math.min(8, videoMaxDuration);

  /** Replace known {{...}} placeholders with real values for display */
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

  const rawContent =
    selectedPromptKey && selectedSlotKey
      ? getSlotContent(selectedPromptKey, selectedSlotKey)
      : "";
  const currentContent = resolvePlaceholders(rawContent);

  const handleSave = async () => {
    if (!selectedPromptKey) return;
    setSaving(true);
    try {
      const dirtySlots = store.dirtySlots(selectedPromptKey);
      const slots: Record<string, string> = {};
      for (const sk of dirtySlots) {
        slots[sk] = getSlotContent(selectedPromptKey, sk);
      }
      // Auto-enable project prompts on save
      if (isProject && !projectPromptsEnabled) {
        await apiFetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useProjectPrompts: 1 }),
        });
        setProjectPromptsEnabled(true);
      }
      await apiFetch(`${templatesBasePath}/${selectedPromptKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "slots", slots }),
      });
      // Refresh overrides
      const resp = await apiFetch(templatesBasePath);
      const data = await resp.json();
      setServerOverrides(data);
      clearEdits(selectedPromptKey);
      toast.success(t("editor.savedSuccess"));
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedPromptKey) return;
    try {
      await apiFetch(`${templatesBasePath}/${selectedPromptKey}`, {
        method: "DELETE",
      });
      const resp = await apiFetch(templatesBasePath);
      const data = await resp.json();
      setServerOverrides(data);
      clearEdits(selectedPromptKey);
      toast.success(t("editor.resetSuccess"));
    } catch {
      toast.error("Reset failed");
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Project prompts toggle */}
      {isProject && (
        <div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={projectPromptsEnabled}
              onChange={async () => {
                const next = !projectPromptsEnabled;
                setProjectPromptsEnabled(next);
                await apiFetch(`/api/projects/${projectId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ useProjectPrompts: next ? 1 : 0 }),
                });
              }}
              className="size-4 accent-primary"
            />
            <span className="text-xs font-medium text-primary">
              {t("project.useProjectPrompts")}
            </span>
          </label>
          <span className="text-xs text-[var(--text-secondary)]">
            {t("project.useProjectPromptsDesc")}
          </span>
        </div>
      )}

      <label className="flex flex-wrap items-center gap-4 border-y border-border py-4 text-sm">
        {t("title")}
        <select
          aria-label={t("title")}
          value={selectedPromptKey ?? ""}
          onChange={(event) => selectPrompt(event.target.value)}
          className="h-9 min-w-0 max-w-full border border-input bg-white px-3"
        >
          {Object.entries(grouped).map(([category, prompts]) => (
            <optgroup
              key={category}
              label={t(`categories.${category}` as Parameters<typeof t>[0])}
            >
              {prompts.map((prompt) => (
                <option key={prompt.key} value={prompt.key}>
                  {t(tKey(prompt.nameKey) as Parameters<typeof t>[0])}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {/* Preset dialog */}
      {selectedPromptKey && (
        <PresetDialog
          open={presetDialogOpen}
          onOpenChange={setPresetDialogOpen}
          promptKey={selectedPromptKey}
        />
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:min-h-[680px] lg:grid-cols-[184px_minmax(0,1fr)]">
        {/* Middle column: Slot list */}
        <div className="max-h-48 overflow-y-auto border-b border-border lg:max-h-[760px] lg:border-b-0">
          <SlotList />
        </div>

        {/* Right column: Editor + Preview */}
        <div className="flex min-w-0 flex-col">
          {selectedPrompt ? (
            <>
              {/* Editor header — always visible */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {mode === "slots" && selectedSlot
                      ? t(
                          tKey(selectedSlot.nameKey) as Parameters<typeof t>[0],
                        ) || selectedSlot.key
                      : t("editor.advancedMode")}
                  </span>
                  {mode === "slots" &&
                    selectedSlot &&
                    !selectedSlot.editable && (
                      <span className="text-xs text-muted-foreground">
                        {t("editor.locked")}
                      </span>
                    )}
                  {selectedPromptKey && isDirty(selectedPromptKey) && (
                    <span className="text-xs text-muted-foreground">
                      {t("editor.modified")}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMode("slots")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        mode === "slots"
                          ? "bg-white text-foreground underline underline-offset-8"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {t("editor.slotMode")}
                    </button>
                    <button
                      onClick={() => setMode("advanced")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        mode === "advanced"
                          ? "bg-white text-foreground underline underline-offset-8"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {t("editor.advancedMode")}
                    </button>
                  </div>

                  {mode === "slots" && (
                    <>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setPresetDialogOpen(true)}
                        disabled={!selectedPromptKey}
                      >
                        {t("presets.openPresets")}
                      </Button>

                      <Button size="xs" variant="ghost" onClick={handleReset}>
                        {t("editor.resetDefault")}
                      </Button>

                      <Button
                        size="xs"
                        onClick={handleSave}
                        disabled={
                          saving ||
                          !selectedPromptKey ||
                          !isDirty(selectedPromptKey)
                        }
                      >
                        {t("editor.save")}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Editor body — fills remaining height, no page scroll */}
              {mode === "advanced" ? (
                <AdvancedEditor scope={scope} projectId={projectId} />
              ) : selectedSlot ? (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto py-3">
                    <textarea
                      aria-label={t(
                        tKey(selectedSlot.nameKey) as Parameters<typeof t>[0],
                      )}
                      value={currentContent}
                      readOnly={!selectedSlot.editable}
                      onChange={(e) => {
                        if (
                          selectedPromptKey &&
                          selectedSlotKey &&
                          selectedSlot.editable
                        ) {
                          setSlotContent(
                            selectedPromptKey,
                            selectedSlotKey,
                            e.target.value,
                          );
                        }
                      }}
                      className={`min-h-80 h-full w-full resize-y border-0 px-0 py-3 font-sans text-sm leading-7 text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[var(--text-muted)] ${
                        selectedSlot.editable
                          ? "bg-white hover:border-[var(--border-hover)] focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                          : "bg-[var(--surface)] cursor-default"
                      }`}
                      placeholder={t("editor.edit")}
                    />
                  </div>
                  <details className="border-t border-border py-4">
                    <summary className="text-sm font-medium text-muted-foreground">
                      {t("editor.previewFull")}
                    </summary>
                    <div className="mt-3">
                      <PromptPreview />
                    </div>
                  </details>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
                  {t("editor.slotMode")}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
              {t("editor.edit")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
