"use client";

import { useDraft } from "@/hooks/use-draft";
import { useAutosave } from "@/hooks/use-autosave";
import { Textarea } from "@/components/ui/textarea";
import { AiOptimizeButton } from "../ai-optimize-button";

export function TextField({
  value,
  label,
  fieldLabel,
  projectId,
  onSave,
  images,
  rows = 2,
}: {
  value: string;
  label: string;
  fieldLabel: string;
  projectId: string;
  onSave: (value: string) => Promise<unknown>;
  images?: string[];
  rows?: number;
}) {
  const [draft, setDraft] = useDraft(value);
  const save = useAutosave(onSave);
  function change(next: string) {
    setDraft(next);
    save(next);
  }
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-[--text-muted]">{label}</span>
        <AiOptimizeButton
          value={draft}
          fieldLabel={fieldLabel}
          projectId={projectId}
          images={images}
          onOptimized={(next) => {
            change(next);
            void save.flush();
          }}
        />
      </div>
      <Textarea
        aria-label={label}
        placeholder={label}
        value={draft}
        rows={rows}
        onChange={(e) => change(e.target.value)}
        onBlur={() => {
          void save.flush();
        }}
        className="min-w-0 resize-y text-sm leading-relaxed"
      />
    </div>
  );
}
