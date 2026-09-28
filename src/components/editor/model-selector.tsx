"use client";

import { useEffect, useMemo } from "react";
import {
  useModelStore,
  type Capability,
  type ModelRef,
} from "@/stores/model-store";
import { useTranslations } from "next-intl";

const SETTERS: Record<
  Capability,
  "setDefaultTextModel" | "setDefaultImageModel" | "setDefaultVideoModel"
> = {
  text: "setDefaultTextModel",
  image: "setDefaultImageModel",
  video: "setDefaultVideoModel",
};

const GETTERS: Record<
  Capability,
  "defaultTextModel" | "defaultImageModel" | "defaultVideoModel"
> = {
  text: "defaultTextModel",
  image: "defaultImageModel",
  video: "defaultVideoModel",
};

interface InlineModelPickerProps {
  capability: Capability;
  value?: ModelRef | null;
  onChange?: (ref: ModelRef) => void;
}

export function InlineModelPicker({
  capability,
  value: controlledValue,
  onChange,
}: InlineModelPickerProps) {
  const t = useTranslations("settings");
  const providers = useModelStore((s) => s.providers);
  const globalValue = useModelStore((s) => s[GETTERS[capability]]);
  const globalSetter = useModelStore((s) => s[SETTERS[capability]]);
  const isControlled = onChange !== undefined;
  const value = isControlled ? controlledValue : globalValue;
  const setter = isControlled ? onChange : globalSetter;
  const options = useMemo(() => {
    const result: {
      providerId: string;
      providerName: string;
      modelId: string;
      modelName: string;
    }[] = [];
    for (const p of providers) {
      if (p.capability !== capability) continue;
      for (const m of p.models) {
        if (!m.checked) continue;
        result.push({
          providerId: p.id,
          providerName: p.name,
          modelId: m.id,
          modelName: m.name,
        });
      }
    }
    return result;
  }, [providers, capability]);

  // Auto-select first option if nothing is selected (only in uncontrolled mode)
  useEffect(() => {
    if (!isControlled && !value && options.length > 0) {
      globalSetter({
        providerId: options[0].providerId,
        modelId: options[0].modelId,
      });
    }
  }, [isControlled, value, options, globalSetter]);

  if (options.length === 0) return null;

  const currentKey = value ? `${value.providerId}:${value.modelId}` : "";
  const multiProvider = new Set(options.map((o) => o.providerId)).size > 1;

  function getLabel(opt: (typeof options)[number]) {
    return multiProvider
      ? `${opt.providerName} / ${opt.modelName}`
      : opt.modelName;
  }

  return (
    <select
      aria-label={t(GETTERS[capability])}
      value={currentKey}
      onChange={(event) => {
        const option = options.find(
          (item) => `${item.providerId}:${item.modelId}` === event.target.value,
        );
        if (option)
          setter({ providerId: option.providerId, modelId: option.modelId });
      }}
      className="h-9 min-w-0 max-w-full rounded-md border border-input bg-white px-2 text-sm text-foreground sm:max-w-64"
    >
      {!options.some(
        (option) => `${option.providerId}:${option.modelId}` === currentKey,
      ) && <option value={currentKey}>—</option>}
      {options.map((option) => (
        <option
          key={`${option.providerId}:${option.modelId}`}
          value={`${option.providerId}:${option.modelId}`}
        >
          {getLabel(option)}
        </option>
      ))}
    </select>
  );
}
