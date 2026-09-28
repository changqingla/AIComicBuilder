// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useDraft } from "@/hooks/use-draft";
import { useAutosave } from "@/hooks/use-autosave";
import { createElement, type ReactNode } from "react";
import {
  AutosaveProvider,
  useFlushAutosaves,
} from "@/components/editor/autosave-provider";
import { useShotGeneration } from "@/hooks/use-shot-generation";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-fetch", () => ({ apiFetch: request }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-model-guard", () => ({ useModelGuard: () => () => true }));
vi.mock("@/stores/model-store", () => ({
  useModelStore: { getState: () => ({ getModelConfig: () => ({}) }) },
}));
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(AutosaveProvider, null, children);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

test.each([true, false])(
  "generation waits for saves and proceeds only on success (%s)",
  async (success) => {
    let finish!: (success: boolean) => void;
    const save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const onUpdate = vi.fn();
    request.mockResolvedValue(new Response("{}"));
    const { result } = renderHook(
      () => ({
        save: useAutosave(save),
        generation: useShotGeneration({
          projectId: "p",
          shot: {
            id: "s",
            sequence: 1,
            prompt: "Scene",
            videoScript: null,
            motionScript: null,
            cameraDirection: "static",
            duration: 5,
            videoPrompt: "Prompt",
            status: "completed",
            dialogues: [],
            assets: [],
          },
          versionId: "v",
          onUpdate,
          generationMode: "keyframe",
          videoRatio: "16:9",
        }),
      }),
      { wrapper },
    );
    let generated!: Promise<void>;
    await act(async () => {
      result.current.save.schedule("Latest prompt");
      generated = result.current.generation.run("video");
    });
    expect(save).toHaveBeenCalledWith("Latest prompt");
    expect(request).not.toHaveBeenCalled();
    await act(async () => {
      finish(success);
      await generated;
    });
    expect(request).toHaveBeenCalledTimes(success ? 1 : 0);
    expect(onUpdate).toHaveBeenCalledTimes(success ? 1 : 0);
  },
);

test("closing an editor flushes its last edit and generation still waits for it", async () => {
  let finish!: (success: boolean) => void;
  const save = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  let autosave!: ReturnType<typeof useAutosave<string>>;
  let flush!: () => Promise<boolean>;
  function Field() {
    autosave = useAutosave(save);
    return null;
  }
  function Editor({ visible }: { visible: boolean }) {
    flush = useFlushAutosaves();
    return visible ? createElement(Field) : null;
  }
  const tree = (visible: boolean) =>
    createElement(AutosaveProvider, null, createElement(Editor, { visible }));
  const { rerender } = render(tree(true));
  act(() => {
    autosave.schedule("Before leaving");
  });
  rerender(tree(false));
  await act(async () => {
    await Promise.resolve();
  });
  expect(save).toHaveBeenCalledWith("Before leaving");
  let done = false;
  const flushed = flush().then((success) => {
    done = true;
    return success;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  finish(true);
  await expect(flushed).resolves.toBe(true);
});

test("a save response preserves text typed while the save was in flight", () => {
  const { result, rerender } = renderHook(
    ({ saved }) => useDraft(saved, { preserveUnsaved: true }),
    {
      initialProps: { saved: "Original" },
    },
  );
  act(() => result.current[1]("First edit"));
  act(() => result.current[1]("Second edit"));
  rerender({ saved: "First edit" });
  expect(result.current[0]).toBe("Second edit");
  rerender({ saved: "Second edit" });
  rerender({ saved: "Generated text" });
  expect(result.current[0]).toBe("Generated text");
});

test("saves for one field finish in order even when the first request is slow", async () => {
  vi.useFakeTimers();
  let finish!: (success: boolean) => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(true);
  const { result } = renderHook(() => useAutosave(save));
  act(() => {
    result.current.schedule("First edit");
  });
  await act(() => vi.advanceTimersByTimeAsync(500));
  act(() => {
    result.current.schedule("Second edit");
  });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(true);
    await result.current.flush();
  });
  expect(save.mock.calls).toEqual([["First edit"], ["Second edit"]]);
});
