"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Flush = () => Promise<boolean>;
export const AutosaveContext = createContext<{
  register: (flush: Flush) => () => void;
  flush: Flush;
} | null>(null);

export function AutosaveProvider({ children }: { children: ReactNode }) {
  const [autosaves] = useState(() => {
    const fields = new Set<{ flush: Flush }>();
    return {
      register(flush: Flush) {
        const field = { flush };
        fields.add(field);
        return () => {
          // A card may unmount while its replacement drawer is opening.
          // Keep that save visible to generation until it has finished.
          void flush().finally(() => fields.delete(field));
        };
      },
      async flush() {
        const results = await Promise.all(
          [...fields].map((field) => field.flush()),
        );
        return results.every(Boolean);
      },
    };
  });
  return <AutosaveContext value={autosaves}>{children}</AutosaveContext>;
}

export function useFlushAutosaves() {
  const autosaves = useContext(AutosaveContext);
  return autosaves?.flush ?? (async () => true);
}
