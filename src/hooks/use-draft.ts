"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

// Adopt external changes once local edits have been saved. An earlier save
// response must not replace text that the user has continued to edit.
export function useDraft<T>(
  saved: T,
  { preserveUnsaved = false }: { preserveUnsaved?: boolean } = {},
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState({ saved, value: saved });
  const changed = !Object.is(state.saved, saved);
  const dirty = !Object.is(state.value, state.saved);
  const value = changed && !(preserveUnsaved && dirty) ? saved : state.value;
  if (!Object.is(state.saved, saved)) setState({ saved, value });
  const setValue: Dispatch<SetStateAction<T>> = (next) =>
    setState((current) => ({
      ...current,
      value:
        typeof next === "function"
          ? (next as (value: T) => T)(current.value)
          : next,
    }));
  return [value, setValue];
}
