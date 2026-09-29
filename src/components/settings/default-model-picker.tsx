"use client";

import { Label } from "@/components/ui/label";
import { useModelStore, type ModelRef } from "@/stores/model-store";
import { useTranslations } from "next-intl";

interface PickerRowProps {
  label: string;
  options: {
    providerId: string;
    providerName: string;
    modelId: string;
    modelName: string;
  }[];
  value: ModelRef | null;
  onChange: (ref: ModelRef | null) => void;
}

function PickerRow({ label, options, value, onChange }: PickerRowProps) {
  const t = useTranslations("workspace");
  const currentValue = value ? `${value.providerId}:${value.modelId}` : "";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <Label className="text-sm text-muted-foreground">{label}</Label>
        <select
          aria-label={label}
          value={currentValue}
          onChange={(e) => {
            if (!e.target.value) {
              onChange(null);
              return;
            }
            const [providerId, ...rest] = e.target.value.split(":");
            const modelId = rest.join(":");
            onChange({ providerId, modelId });
          }}
          className="mt-2 block h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground"
        >
          <option value="">{t("selectModel")}</option>
          {options.map((opt) => (
            <option
              key={`${opt.providerId}:${opt.modelId}`}
              value={`${opt.providerId}:${opt.modelId}`}
            >
              {opt.providerName} / {opt.modelName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function DefaultModelPicker() {
  const t = useTranslations("settings");
  const {
    providers,
    defaultTextModel,
    defaultImageModel,
    defaultVideoModel,
    setDefaultTextModel,
    setDefaultImageModel,
    setDefaultVideoModel,
  } = useModelStore();

  function getOptions(capability: string) {
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
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <PickerRow
        label={t("defaultTextModel")}
        options={getOptions("text")}
        value={defaultTextModel}
        onChange={setDefaultTextModel}
      />
      <PickerRow
        label={t("defaultImageModel")}
        options={getOptions("image")}
        value={defaultImageModel}
        onChange={setDefaultImageModel}
      />
      <PickerRow
        label={t("defaultVideoModel")}
        options={getOptions("video")}
        value={defaultVideoModel}
        onChange={setDefaultVideoModel}
      />
    </div>
  );
}
