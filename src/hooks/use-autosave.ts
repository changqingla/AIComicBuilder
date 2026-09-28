"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { AutosaveContext } from "@/components/editor/autosave-provider";

// Each editor owns its timer; edits to another field cannot cancel this save.
export function useAutosave<T>(
  save: (value: T) => Promise<boolean>,
  delay = 500,
) {
  const autosaves = useContext(AutosaveContext);
  const queued = useRef<Promise<boolean>>(Promise.resolve(true));
  const schedule = useDebouncedCallback((value: T) => {
    // Capture this save's target and serialize writes to the same field.
    const write = () => save(value);
    queued.current = queued.current.then(write, write);
  }, delay);
  const flush = useCallback(() => {
    schedule.flush();
    return queued.current;
  }, [schedule]);
  useEffect(() => {
    const unregister = autosaves?.register(flush);
    const onVisibilityChange = () => {
      void flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (unregister) unregister();
      else void flush();
    };
  }, [autosaves, flush]);
  return { schedule, flush };
}
