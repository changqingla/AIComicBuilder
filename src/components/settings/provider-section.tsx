"use client";

import { ProviderCard } from "@/components/settings/provider-card";
import { ProviderForm } from "@/components/settings/provider-form";
import { Button } from "@/components/ui/button";
import {
  useModelStore,
  type Capability,
  type Protocol,
} from "@/stores/model-store";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface ProviderSectionProps {
  capability: Capability;
  defaultProtocol: Protocol;
  defaultBaseUrl: string;
}

export function ProviderSection({
  capability,
  defaultProtocol,
  defaultBaseUrl,
}: ProviderSectionProps) {
  const t = useTranslations("settings");
  const { providers, addProvider, removeProvider } = useModelStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sectionProviders = providers.filter((p) => p.capability === capability);
  const selectedProvider =
    sectionProviders.find((p) => p.id === selectedId) ||
    sectionProviders[0] ||
    null;

  function handleAdd() {
    const id = addProvider({
      name: "New Provider",
      protocol: defaultProtocol,
      capability,
      baseUrl: defaultBaseUrl,
      apiKey: "",
    });
    setSelectedId(id);
  }

  function handleDelete(id: string) {
    removeProvider(id);
    if (selectedId === id) {
      const remaining = sectionProviders.filter((p) => p.id !== id);
      setSelectedId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  return (
    <div className="grid gap-6 py-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0">
        <div className="mb-5 flex items-center justify-between gap-2">
          <h3 className="text-sm text-muted-foreground">{t("providers")}</h3>
          <Button size="sm" variant="ghost" onClick={handleAdd}>
            {t("addProvider")}
          </Button>
        </div>
        <div className="divide-y divide-border">
          {sectionProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              selected={provider.id === selectedProvider?.id}
              onSelect={() => setSelectedId(provider.id)}
              onDelete={() => handleDelete(provider.id)}
            />
          ))}
        </div>
      </div>
      {selectedProvider ? (
        <ProviderForm key={selectedProvider.id} provider={selectedProvider} />
      ) : (
        <p className="py-4 text-sm text-muted-foreground">{t("noProviders")}</p>
      )}
    </div>
  );
}
