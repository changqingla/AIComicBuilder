"use client";

import { useEffect, useRef, useState } from "react";
import { useModelGuard } from "@/hooks/use-model-guard";
import { id } from "@/lib/id";
import { apiFetch, fetchJson } from "@/lib/api-fetch";
import type {
  ImportedCharacter,
  ImportedEpisode,
  ImportedRelationship,
  ImportLog,
  ImportStep,
  ImportStepStatus,
} from "@/lib/import-types";
import { useModelStore } from "@/stores/model-store";

const idleSteps: ImportStepStatus = {
  1: "idle",
  2: "idle",
  3: "idle",
  4: "idle",
};

export function useProjectImport(projectId: string, onComplete: () => void) {
  const textGuard = useModelGuard("text");
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<ImportStep | 0>(0);
  const [status, setStatus] = useState<ImportStepStatus>(idleSteps);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [historyMode, setHistoryMode] = useState(false);
  const [fullText, setFullText] = useState("");
  const [characters, setCharacters] = useState<ImportedCharacter[]>([]);
  const [relationships, setRelationships] = useState<ImportedRelationship[]>(
    [],
  );
  const [episodes, setEpisodes] = useState<ImportedEpisode[]>([]);
  const lastFile = useRef<File | null>(null);
  const running = useRef(false);

  useEffect(() => {
    let active = true;
    fetchJson<ImportLog[]>(`/api/projects/${projectId}/import/logs`)
      .then((entries) => {
        if (!active || !entries.length) return;
        const restored = { ...idleSteps };
        for (const entry of entries) restored[entry.step] = entry.status;
        setStatus(restored);
        setLogs(entries);
        setHistoryMode(true);
        setCurrentStep(entries.at(-1)!.step);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  function log(
    step: ImportStep,
    state: ImportLog["status"],
    message: string,
    metadata?: ImportLog["metadata"],
  ) {
    if (state === "running") setCurrentStep(step);
    setStatus((previous) => ({ ...previous, [step]: state }));
    setLogs((previous) => [
      ...previous,
      { id: id(), step, status: state, message, metadata },
    ]);
  }

  function fail(step: ImportStep, error: unknown) {
    log(step, "error", error instanceof Error ? error.message : String(error));
  }

  async function post<T>(step: string, body: unknown): Promise<T> {
    return (
      await apiFetch(`/api/projects/${projectId}/import/${step}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
  }

  async function extractCharacters(text: string) {
    log(2, "running", "开始角色提取...");
    try {
      const result = await post<{
        characters: ImportedCharacter[];
        relationships: ImportedRelationship[];
      }>("characters", {
        text,
        modelConfig: useModelStore.getState().getModelConfig(),
      });
      setCharacters(result.characters);
      setRelationships(result.relationships);
      const mainCount = result.characters.filter(
        (character) => character.scope === "main",
      ).length;
      log(
        2,
        "done",
        `提取完成: ${mainCount} 个主角, ${result.characters.length - mainCount} 个配角`,
        { characters: result.characters },
      );
    } catch (error) {
      fail(2, error);
    }
  }

  async function start(file: File) {
    if (running.current || !textGuard()) return;
    running.current = true;
    lastFile.current = file;
    setHistoryMode(false);
    setStatus(idleSteps);
    setLogs([]);
    setFullText("");
    setCharacters([]);
    setRelationships([]);
    setEpisodes([]);
    log(1, "running", `解析文件: ${file.name}`);
    try {
      await apiFetch(`/api/projects/${projectId}/import/logs`, {
        method: "DELETE",
      });
      const form = new FormData();
      form.append("file", file);
      const response = await apiFetch(
        `/api/projects/${projectId}/import/parse`,
        { method: "POST", body: form },
      );
      const result: { text: string; charCount: number } = await response.json();
      setFullText(result.text);
      log(1, "done", `解析完成，共 ${result.charCount} 字`);
      await extractCharacters(result.text);
    } catch (error) {
      fail(1, error);
    } finally {
      running.current = false;
    }
  }

  async function split() {
    if (running.current || !textGuard()) return;
    running.current = true;
    log(3, "running", "开始自动分集...");
    try {
      const result = await post<{ episodes: ImportedEpisode[] }>("split", {
        text: fullText,
        allCharacters: characters.map(({ name, scope }) => ({ name, scope })),
        modelConfig: useModelStore.getState().getModelConfig(),
      });
      setEpisodes(result.episodes);
      log(3, "done", `分集完成，共 ${result.episodes.length} 集`, {
        episodes: result.episodes,
      });
    } catch (error) {
      fail(3, error);
    } finally {
      running.current = false;
    }
  }

  async function generate() {
    if (running.current || !episodes.length) return;
    running.current = true;
    log(4, "running", `创建 ${episodes.length} 集和角色...`);
    try {
      const result = await post<{
        characterCount: number;
        episodes: unknown[];
      }>("generate", { episodes, characters, relationships });
      log(
        4,
        "done",
        `导入完成！创建了 ${result.characterCount} 个角色和 ${result.episodes.length} 集`,
      );
      onComplete();
    } catch (error) {
      fail(4, error);
    } finally {
      running.current = false;
    }
  }

  async function retry() {
    if (running.current) return;
    switch (currentStep) {
      case 1:
        if (lastFile.current) await start(lastFile.current);
        break;
      case 2:
        if (!textGuard()) return;
        running.current = true;
        try {
          await extractCharacters(fullText);
        } finally {
          running.current = false;
        }
        break;
      case 3:
        await split();
        break;
      case 4:
        await generate();
        break;
    }
  }

  function reset() {
    setHistoryMode(false);
    setCurrentStep(0);
    setStatus(idleSteps);
    setLogs([]);
    setFullText("");
    setCharacters([]);
    setRelationships([]);
    setEpisodes([]);
    lastFile.current = null;
  }

  return {
    loading,
    currentStep,
    status,
    logs,
    historyMode,
    characters,
    episodes,
    start,
    split,
    generate,
    retry,
    reset,
    toggleScope(index: number) {
      setCharacters((previous) =>
        previous.map((character, i) =>
          i === index
            ? {
                ...character,
                scope: character.scope === "main" ? "guest" : "main",
              }
            : character,
        ),
      );
    },
    renameEpisode(index: number, title: string) {
      setEpisodes((previous) =>
        previous.map((episode, i) =>
          i === index ? { ...episode, title } : episode,
        ),
      );
    },
    removeEpisode(index: number) {
      setEpisodes((previous) => previous.filter((_, i) => i !== index));
    },
  };
}
