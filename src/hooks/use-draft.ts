"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

// An editable value follows its saved value when that value changes externally.
export function useDraft<T>(saved: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState({ saved, value: saved });
  if (!Object.is(state.saved, saved)) setState({ saved, value: saved });
  const setValue: Dispatch<SetStateAction<T>> = (next) => setState((current) => ({
    ...current, value: typeof next === "function" ? (next as (value: T) => T)(current.value) : next,
  }));
  return [Object.is(state.saved, saved) ? state.value : saved, setValue];
}
