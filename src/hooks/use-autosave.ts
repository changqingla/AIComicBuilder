"use client";

import { useEffect } from "react";
import { useDebouncedCallback } from "use-debounce";

// Each editor owns its timer; edits to another field cannot cancel this save.
export function useAutosave<T>(save: (value: T) => Promise<unknown>) {
  const deferred = useDebouncedCallback(save, 500);
  useEffect(() => {
    const flush = () => {
      void deferred.flush();
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [deferred]);
  return deferred;
}
