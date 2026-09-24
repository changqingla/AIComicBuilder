"use client";
import { useDebouncedCallback } from "use-debounce";
import type { EpisodeDetail } from "@/stores/episode-editor-store";
import { useParams } from "next/navigation";

import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEpisodeEditorStore } from "@/stores/episode-editor-store";

import { useModelStore } from "@/stores/model-store";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Loader2,
  FileText,
  Lightbulb,
  ListOrdered,
} from "lucide-react";
import { InlineModelPicker } from "@/components/editor/model-selector";
import { AgentPicker } from "@/components/agent-picker";
import { apiFetch } from "@/lib/api-fetch";
import { useModelGuard } from "@/hooks/use-model-guard";
import { PromptEditButton } from "@/components/prompt-templates/prompt-edit-button";
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
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("common.generationFailed"),
      );
    } finally {
      setSaving(false);
    }
  }
  const saveLater = useDebouncedCallback(save, 1500);
  useEffect(
    () => () => {
      saveLater.flush();
    },
    [saveLater],
  );

  function edit(patch: Partial<EpisodeDetail>) {
    if (!episode) return;
    updateDraft(episodeId, patch);
    saveLater({ ...episode, ...patch });
  }
  function handleSave() {
    if (saveLater.isPending()) saveLater.flush();
  }

  if (!episode) return null;

  async function handleGenerateOutline() {
    if (!episode) return;
    if (!textGuard("script_outline", episode.projectId)) return;
    await saveLater.flush();
    setGeneratingOutline(true);
    setOutline("");

    try {
      const resp = await apiFetch(
        `/api/projects/${episode.projectId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "script_outline",
            payload: { idea: episode.idea || "" },
            modelConfig: getModelConfig(),
            episodeId: episodeId,
          }),
        },
      );
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
    await saveLater.flush();
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

        const outlineResp = await apiFetch(
          `/api/projects/${episode.projectId}/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "script_outline",
              payload: { idea },
              modelConfig: getModelConfig(),
              episodeId: episodeId,
            }),
          },
        );

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

      const response = await apiFetch(
        `/api/projects/${episode.projectId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "script_generate",
            payload: { idea, outline: currentOutline || undefined },
            modelConfig: getModelConfig(),
            episodeId: episodeId,
          }),
        },
      );

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
    <div className="animate-page-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/8">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-display text-xl font-bold tracking-tight text-[--text-primary]">
            {t("project.script")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <PromptEditButton
            promptKeys={["script_outline", "script_generate"]}
            projectId={episode.projectId}
          />
          <InlineModelPicker capability="text" />
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-[--text-muted]">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("common.saving")}
            </span>
          )}
        </div>
      </div>

      {/* Idea input */}
      <div className="rounded-2xl border border-[--border-subtle] bg-white p-1.5">
        <div className="flex items-center gap-2 px-5 pt-3 pb-1">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[--text-muted]">
            {t("episode.idea")}
          </span>
        </div>
        <Textarea
          value={episode.idea}
          onChange={(e) => {
            edit({ idea: e.target.value });
          }}
          onBlur={handleSave}
          placeholder={t("project.scriptIdeaPlaceholder")}
          rows={4}
          disabled={generating}
          className={`h-[30vh] resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-5 pb-4 font-mono text-sm leading-relaxed placeholder:text-[--text-muted] focus-visible:ring-0 ${
            generating ? "opacity-40" : ""
          }`}
        />
      </div>

      {/* Outline + Generated script — side by side, fixed height */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Outline section */}
        <div className="flex flex-col rounded-2xl border border-[--border-subtle] bg-white p-1.5">
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[--text-muted]">
                {t("project.outline")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AgentPicker
                projectId={episode.projectId}
                category="script_outline"
              />
              <Button
                size="sm"
                onClick={handleGenerateOutline}
                disabled={
                  generatingOutline || generating || !episode.idea?.trim()
                }
              >
                {generatingOutline ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generatingOutline
                  ? t("common.generating")
                  : t("project.generateOutline")}
              </Button>
            </div>
          </div>

          <Textarea
            value={outline}
            onChange={(e) => handleOutlineChange(e.target.value)}
            onBlur={handleSave}
            placeholder={t("project.outlinePlaceholder")}
            disabled={generatingOutline}
            className={`h-[55vh] max-h-[55vh] resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-5 pb-4 font-mono text-sm leading-relaxed placeholder:text-[--text-muted] focus-visible:ring-0 ${
              generatingOutline ? "opacity-40" : ""
            }`}
          />
        </div>

        {/* Generated script */}
        <div className="flex flex-col rounded-2xl border border-[--border-subtle] bg-white p-1.5">
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[--text-muted]">
                {t("project.generatedScript")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AgentPicker
                projectId={episode.projectId}
                category="script_generate"
              />
              <Button
                size="sm"
                onClick={handleGenerateScript}
                disabled={
                  generating || generatingOutline || !episode.idea?.trim()
                }
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generating
                  ? t("common.generating")
                  : t("project.generateScript")}
              </Button>
            </div>
          </div>
          {episode.script ? (
            <Textarea
              ref={scriptTextareaRef}
              value={episode.script}
              onChange={(e) => {
                edit({ script: e.target.value });
              }}
              onBlur={() => {
                if (!generating) handleSave();
              }}
              disabled={generating}
              className={`h-[55vh] max-h-[55vh] resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-5 pb-4 font-mono text-sm leading-relaxed placeholder:text-[--text-muted] focus-visible:ring-0 ${
                generating ? "opacity-40" : ""
              }`}
            />
          ) : (
            <div className="h-[55vh] max-h-[55vh] overflow-y-auto px-5 pb-4 pt-2 text-sm text-[--text-muted]">
              {t("project.scriptPlaceholder") || "点击上方按钮生成剧本..."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
