"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useModelStore,
  type Capability,
  type Protocol,
} from "@/stores/model-store";
import { ProviderCard } from "@/components/settings/provider-card";
import { ProviderForm } from "@/components/settings/provider-form";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface ProviderSectionProps {
  capability: Capability;
  label: string;
  icon: React.ReactNode;
  defaultProtocol: Protocol;
  defaultBaseUrl: string;
}

export function ProviderSection({
  capability,
  label,
  icon,
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
    <div className="space-y-5 p-5 sm:p-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-medium text-foreground">
          {icon}
          {label}
        </h3>
        <Button size="sm" variant="outline" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5" />
          {t("addProvider")}
        </Button>
      </div>

      {sectionProviders.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center gap-3 py-8">
          <div className="h-6 w-6 text-[var(--text-muted)]">{icon}</div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {t("noProviders")}
          </p>
        </div>
      ) : (
        <>
          {/* Provider cards */}
          <div className="flex flex-wrap gap-2">
            {sectionProviders.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                selected={p.id === selectedProvider?.id}
                onSelect={() => setSelectedId(p.id)}
                onDelete={() => handleDelete(p.id)}
              />
            ))}
          </div>

          {/* Provider form */}
          {selectedProvider ? (
            <ProviderForm
              key={selectedProvider.id}
              provider={selectedProvider}
            />
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface)]/50 py-8">
              <p className="text-sm text-[var(--text-muted)]">
                {t("selectProvider")}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
