"use client";

import { AgentSection } from "@/components/settings/agent-section";
import { DefaultModelPicker } from "@/components/settings/default-model-picker";
import { ProviderSection } from "@/components/settings/provider-section";
import { PageHeader } from "@/components/workspace/page-header";
import { WorkspaceShell } from "@/components/workspace/shell";
import { Tabs } from "@base-ui/react/tabs";
import { useTranslations } from "next-intl";

export default function SettingsPage() {
  const t = useTranslations();
  const sections = [
    {
      capability: "text",
      label: "languageModels",
      protocol: "openai",
      baseUrl: "https://api.openai.com",
    },
    {
      capability: "image",
      label: "imageModels",
      protocol: "kling",
      baseUrl: "https://api.klingai.com",
    },
    {
      capability: "video",
      label: "videoModels",
      protocol: "kling",
      baseUrl: "https://api.klingai.com",
    },
  ] as const;
  return (
    <WorkspaceShell>
      <div className="workspace-page space-y-10">
        <PageHeader title={t("settings.title")} />
        <section className="grid gap-5 border-t border-border pt-6 lg:grid-cols-[160px_minmax(0,1fr)]">
          <h2 className="section-heading">{t("settings.defaultModels")}</h2>
          <DefaultModelPicker />
        </section>
        <Tabs.Root defaultValue="text" className="min-w-0">
          <Tabs.List
            aria-label={t("workspace.modelProviders")}
            className="document-tabs"
          >
            {sections.map(({ capability: key, label }) => (
              <Tabs.Tab key={key} value={key} className="document-tab shrink-0">
                {t(`settings.${label}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {sections.map(({ capability: key, protocol, baseUrl }) => (
            <Tabs.Panel
              key={key}
              value={key}
              keepMounted
              className="data-[hidden]:hidden"
            >
              <ProviderSection
                capability={key}
                defaultProtocol={protocol}
                defaultBaseUrl={baseUrl}
              />
            </Tabs.Panel>
          ))}
        </Tabs.Root>
        <details className="workspace-panel">
          <summary className="py-4 text-sm font-medium">
            {t("workspace.advancedSettings")}
          </summary>
          <div className="border-t border-border">
            <AgentSection />
          </div>
        </details>
      </div>
    </WorkspaceShell>
  );
}
