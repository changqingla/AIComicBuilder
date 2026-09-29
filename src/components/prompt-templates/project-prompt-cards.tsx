"use client";
import { useDraft } from "@/hooks/use-draft";
import { fetchJson } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────

interface PromptSlot {
  key: string;
  nameKey: string;
  descriptionKey: string;
  defaultContent: string;
  editable: boolean;
}

interface RegistryEntry {
  key: string;
  nameKey: string;
  descriptionKey: string;
  category: string;
  slots: PromptSlot[];
}

interface ProjectPromptTemplate {
  id: string;
  promptKey: string;
  slotKey: string | null;
  scope: string;
  projectId: string;
  content: string;
}

/** Strip "promptTemplates." prefix from registry nameKeys since t() is already scoped */
function tKey(nameKey: string): string {
  return nameKey.replace(/^promptTemplates\./, "");
}

// ── Toggle Switch ─────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
      <span className="text-sm font-medium text-[var(--text-primary)]">
        {label}
      </span>
    </label>
  );
}

// ── Main component ────────────────────────────────────────

interface ProjectPromptCardsProps {
  projectId: string;
}

const EMPTY_OVERRIDES: ProjectPromptTemplate[] = [];

export function ProjectPromptCards({ projectId }: ProjectPromptCardsProps) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("promptTemplates");

  const { data, isLoading: loading } = useSWR(
    ["project-prompts", projectId],
    async ([, id]) => {
      const [registry, overrides, project] = await Promise.all([
        fetchJson<RegistryEntry[]>("/api/prompt-templates/registry"),
        fetchJson<ProjectPromptTemplate[]>(
          `/api/projects/${id}/prompt-templates`,
        ),
        fetchJson<{ useProjectPrompts: boolean }>(`/api/projects/${id}`),
      ]);
      return { registry, overrides, enabled: !!project.useProjectPrompts };
    },
    { revalidateOnFocus: false, onError: () => toast.error("Load failed") },
  );
  const registry = data?.registry ?? [];
  const [overrides, setOverrides] = useDraft(
    data?.overrides ?? EMPTY_OVERRIDES,
  );
  const [enabled, setEnabled] = useDraft(data?.enabled ?? false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Compute per-prompt stats
  function getPromptStats(entry: RegistryEntry) {
    const promptOverrides = overrides.filter((o) => o.promptKey === entry.key);
    const hasOverride = promptOverrides.length > 0;
    const editableSlots = entry.slots.filter((s) => s.editable);
    const modifiedSlotKeys = new Set(promptOverrides.map((o) => o.slotKey));
    const modifiedCount = editableSlots.filter((s) =>
      modifiedSlotKeys.has(s.key),
    ).length;
    return { hasOverride, totalSlots: editableSlots.length, modifiedCount };
  }

  // Toggle: persist via PATCH /api/projects/:id
  const handleToggle = async (value: boolean) => {
    try {
      await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useProjectPrompts: value ? 1 : 0 }),
      });
      setEnabled(value);
      if (!value && overrides.length > 0) {
        // Turning off — also delete all project overrides
        const promptKeys = [...new Set(overrides.map((o) => o.promptKey))];
        await Promise.all(
          promptKeys.map((pk) =>
            apiFetch(`/api/projects/${projectId}/prompt-templates/${pk}`, {
              method: "DELETE",
            }),
          ),
        );
        setOverrides([]);
        toast.success(t("editor.resetSuccess"));
      }
    } catch {
      toast.error("Save failed");
    }
  };

  // Delete all project-level overrides for a promptKey
  async function handleUseGlobal(promptKey: string) {
    setDeletingKey(promptKey);
    try {
      const resp = await apiFetch(
        `/api/projects/${projectId}/prompt-templates/${promptKey}`,
        { method: "DELETE" },
      );
      if (!resp.ok && resp.status !== 204) {
        throw new Error("Delete failed");
      }
      const overResp = await apiFetch(
        `/api/projects/${projectId}/prompt-templates`,
      );
      const overData: ProjectPromptTemplate[] = await overResp.json();
      setOverrides(overData);
      toast.success(t("editor.resetSuccess"));
    } catch {
      toast.error("Failed");
    } finally {
      setDeletingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Toggle header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-5">
        <div className="flex flex-col gap-0.5">
          <ToggleSwitch
            checked={enabled}
            onChange={handleToggle}
            label={t("project.useProjectPrompts")}
          />
          <p className="ml-7 mt-2 text-sm text-[var(--text-muted)]">
            {t("project.useProjectPromptsDesc")}
          </p>
        </div>
        {enabled && overrides.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("editor.overridden")} ({overrides.length})
          </span>
        )}
      </div>

      {/* Card grid */}
      {enabled && (
        <div className="workspace-panel divide-y divide-border">
          {registry.map((entry) => {
            const { hasOverride, totalSlots, modifiedCount } =
              getPromptStats(entry);
            const isDeleting = deletingKey === entry.key;
            const editUrl = `/${locale}/settings/prompts?scope=project&projectId=${projectId}&prompt=${entry.key}`;

            return (
              <div
                key={entry.key}
                className="grid items-center gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {t(tKey(entry.nameKey) as Parameters<typeof t>[0])}
                      </span>
                      {hasOverride ? (
                        <span className="text-xs text-muted-foreground">
                          {t("editor.overridden")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("editor.usingGlobal")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-[var(--text-secondary)]">
                  {t("editor.slotsCount", { count: totalSlots })}
                  {hasOverride && modifiedCount > 0
                    ? `, ${t("project.modifiedCount", { count: modifiedCount })}`
                    : ""}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      router.push(editUrl);
                    }}
                  >
                    {t("editor.edit")}
                  </Button>
                  {hasOverride && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-[var(--text-muted)] hover:text-destructive"
                      disabled={isDeleting}
                      onClick={() => handleUseGlobal(entry.key)}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {t("project.useGlobal")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
