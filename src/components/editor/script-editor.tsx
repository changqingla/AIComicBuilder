"use client";

import { useAutosave } from "@/hooks/use-autosave";
import { requestGeneration } from "@/lib/generation/client";
import type { EpisodeDetail } from "@/stores/episode-editor-store";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";
import { useEffect, useRef, useState } from "react";

import { AgentPicker } from "@/components/agent-picker";
import { InlineModelPicker } from "@/components/editor/model-selector";
import { PromptEditButton } from "@/components/prompt-templates/prompt-edit-button";
import { PageHeader } from "@/components/workspace/page-header";
import { useModelGuard } from "@/hooks/use-model-guard";
import { apiFetch } from "@/lib/api-fetch";
import { useModelStore } from "@/stores/model-store";
import { Tabs } from "@base-ui/react/tabs";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function ScriptEditor() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const t = useTranslations();
  const { episode, updateDraft, fetchEpisode } = useEpisodeEditorStore();
  const getModelConfig = useModelStore((s) => s.getModelConfig);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const outline = episode?.outline ?? "";
  const setOutline = (value: string) =>
    updateDraft(episodeId, { outline: value });
  const updateScript = (value: string) =>
    updateDraft(episodeId, { script: value });
  const textGuard = useModelGuard("text");
  const scriptTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (generating && scriptTextareaRef.current) {
      const el = scriptTextareaRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [episode?.script, generating]);

  async function save(draft: EpisodeDetail) {
    setSaving(true);
    try {
      await apiFetch(`/api/projects/${draft.projectId}/episodes/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: draft.idea,
          script: draft.script,
          outline: draft.outline,
        }),
        keepalive: true,
      });
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.generationFailed"),
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  const saveLater = useAutosave(save, 1500);

  function edit(patch: Partial<EpisodeDetail>) {
    if (!episode) return;
    updateDraft(episodeId, patch);
    saveLater.schedule({ ...episode, ...patch });
  }
  function handleSave() {
    void saveLater.flush();
  }

  if (!episode) return null;

  async function handleGenerateOutline() {
    if (!episode) return;
    if (!textGuard("script_outline", episode.projectId)) return;
    if (!(await saveLater.flush())) return;
    setGeneratingOutline(true);
    setOutline("");

    try {
      const resp = await requestGeneration(episode.projectId, {
        action: "script_outline",
        payload: { idea: episode.idea || "" },
        modelConfig: getModelConfig(),
        episodeId: episodeId,
      });
      if (!resp.ok) throw new Error("Failed to generate outline");

      // Stream response
      if (resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          setOutline(fullText);
        }

        // Update store so it persists
        setOutline(fullText);
      }

      await fetchEpisode(episode.projectId, episodeId);
    } catch (err) {
      setOutline(episode.outline);
      console.error("Outline generate error:", err);
      toast.error(t("common.generationFailed"));
    } finally {
      setGeneratingOutline(false);
    }
  }

  function handleOutlineChange(value: string) {
    edit({ outline: value });
  }

  async function handleGenerateScript() {
    if (!episode) return;
    if (
      !textGuard("script_generate", episode.projectId) ||
      (!outline.trim() && !textGuard("script_outline", episode.projectId))
    )
      return;
    if (!(await saveLater.flush())) return;
    setGenerating(true);

    const idea = episode.idea || "";

    let currentOutline = outline;

    try {
      // Step 1: Auto-generate outline if empty (streaming)
      if (!currentOutline.trim()) {
        setGeneratingOutline(true);
        toast.info(
          t("project.generatingOutlineFirst") || "Generating outline first...",
        );

        const outlineResp = await requestGeneration(episode.projectId, {
          action: "script_outline",
          payload: { idea },
          modelConfig: getModelConfig(),
          episodeId: episodeId,
        });

        if (outlineResp.ok && outlineResp.body) {
          const reader = outlineResp.body.getReader();
          const decoder = new TextDecoder();
          let fullOutline = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullOutline += decoder.decode(value, { stream: true });
            setOutline(fullOutline);
          }

          currentOutline = fullOutline;
          setOutline(fullOutline);
        }
        setGeneratingOutline(false);
      }

      // Step 2: Generate script (with outline if available)
      updateScript("");

      const response = await requestGeneration(episode.projectId, {
        action: "script_generate",
        payload: { idea, outline: currentOutline || undefined },
        modelConfig: getModelConfig(),
        episodeId: episodeId,
      });

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          updateScript(fullText);
        }
      }

      await fetchEpisode(episode.projectId, episodeId ?? undefined);
    } catch (err) {
      updateScript(episode.script);
      console.error("Script generate error:", err);
      toast.error(t("common.generationFailed"));
    }

    setGeneratingOutline(false);
    setGenerating(false);
  }

  return (
    <div>
      <PageHeader title={t("project.script")}>
        {saving && (
          <span role="status" className="text-sm text-muted-foreground">
            {t("common.saving")}
          </span>
        )}
        <PromptEditButton
          promptKeys={["script_outline", "script_generate"]}
          projectId={episode.projectId}
        />
        <InlineModelPicker capability="text" />
      </PageHeader>
      <Tabs.Root defaultValue={episode.script ? "script" : "idea"}>
        <Tabs.List aria-label={t("project.script")} className="document-tabs">
          <Tabs.Tab value="idea" className="document-tab">
            {t("project.idea")}
          </Tabs.Tab>
          <Tabs.Tab value="outline" className="document-tab">
            {t("project.outline")}
          </Tabs.Tab>
          <Tabs.Tab value="script" className="document-tab">
            {t("workspace.scriptDocument")}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel
          value="idea"
          keepMounted
          className="pt-5 data-[hidden]:hidden"
        >
          <label htmlFor="script-idea" className="sr-only">
            {t("project.idea")}
          </label>
          <textarea
            id="script-idea"
            value={episode.idea}
            onChange={(e) => edit({ idea: e.target.value })}
            onBlur={handleSave}
            placeholder={t("project.scriptIdeaPlaceholder")}
            disabled={generating || generatingOutline}
            className="editor-textarea min-h-[55dvh]"
          />
        </Tabs.Panel>
        <Tabs.Panel
          value="outline"
          keepMounted
          className="pt-5 data-[hidden]:hidden"
        >
          <div className="toolbar justify-end">
            <AgentPicker
              projectId={episode.projectId}
              category="script_outline"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateOutline}
              disabled={
                generatingOutline || generating || !episode.idea?.trim()
              }
            >
              {generatingOutline
                ? t("common.generating")
                : t("project.generateOutline")}
            </Button>
          </div>
          <label htmlFor="script-outline" className="sr-only">
            {t("project.outline")}
          </label>
          <textarea
            id="script-outline"
            value={outline}
            onChange={(e) => handleOutlineChange(e.target.value)}
            onBlur={handleSave}
            placeholder={t("project.outlinePlaceholder")}
            disabled={generating || generatingOutline}
            className="editor-textarea min-h-[55dvh]"
          />
        </Tabs.Panel>
        <Tabs.Panel
          value="script"
          keepMounted
          className="pt-5 data-[hidden]:hidden"
        >
          <div className="toolbar justify-end">
            <AgentPicker
              projectId={episode.projectId}
              category="script_generate"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateScript}
              disabled={
                generating || generatingOutline || !episode.idea?.trim()
              }
            >
              {generating
                ? t("common.generating")
                : t("project.generateScript")}
            </Button>
          </div>
          <label htmlFor="script-document" className="sr-only">
            {t("workspace.scriptDocument")}
          </label>
          <textarea
            id="script-document"
            ref={scriptTextareaRef}
            value={episode.script}
            onChange={(e) => edit({ script: e.target.value })}
            onBlur={() => {
              if (!generating) handleSave();
            }}
            placeholder={t("project.scriptPlaceholder")}
            disabled={generating || generatingOutline}
            className="editor-textarea min-h-[65dvh]"
          />
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}
