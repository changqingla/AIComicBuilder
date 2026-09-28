"use client";

import { Tabs } from "@base-ui/react/tabs";
import { useTranslations } from "next-intl";
import { ImageIcon, Type, VideoIcon } from "lucide-react";
import { AgentSection } from "@/components/settings/agent-section";
import { DefaultModelPicker } from "@/components/settings/default-model-picker";
import { ProviderSection } from "@/components/settings/provider-section";
import { WorkspaceHeader } from "@/components/workspace/header";
import { PageHeader } from "@/components/workspace/page-header";

export default function SettingsPage() {
  const t = useTranslations();
  const sections = [
    {
      capability: "text",
      label: "languageModels",
      icon: Type,
      protocol: "openai",
      baseUrl: "https://api.openai.com",
    },
    {
      capability: "image",
      label: "imageModels",
      icon: ImageIcon,
      protocol: "kling",
      baseUrl: "https://api.klingai.com",
    },
    {
      capability: "video",
      label: "videoModels",
      icon: VideoIcon,
      protocol: "kling",
      baseUrl: "https://api.klingai.com",
    },
  ] as const;
  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />
      <main className="workspace-page space-y-6">
        <PageHeader
          title={t("settings.title")}
          description={t("workspace.settingsHint")}
        />
        <section className="workspace-panel p-5 sm:p-6">
          <h2 className="section-heading mb-5">
            {t("settings.defaultModels")}
          </h2>
          <DefaultModelPicker />
        </section>
        <Tabs.Root
          defaultValue="text"
          className="workspace-panel overflow-hidden"
        >
          <Tabs.List
            aria-label={t("workspace.modelProviders")}
            className="flex gap-2 overflow-x-auto border-b border-border px-4 sm:gap-6 sm:px-6"
          >
            {sections.map(({ capability: key, label, icon: Icon }) => (
              <Tabs.Tab
                key={key}
                value={key}
                className="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-1 py-4 text-sm text-muted-foreground data-active:border-primary data-active:font-medium data-active:text-primary"
              >
                <Icon className="size-4" />
                {t(`settings.${label}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {sections.map(
            ({ capability: key, label, icon: Icon, protocol, baseUrl }) => (
              <Tabs.Panel
                key={key}
                value={key}
                keepMounted
                className="data-[hidden]:hidden"
              >
                <ProviderSection
                  capability={key}
                  label={t(`settings.${label}`)}
                  icon={<Icon className="size-5" />}
                  defaultProtocol={protocol}
                  defaultBaseUrl={baseUrl}
                />
              </Tabs.Panel>
            ),
          )}
        </Tabs.Root>
        <details className="workspace-panel">
          <summary className="px-6 py-4 text-sm font-medium">
            {t("workspace.advancedSettings")}
          </summary>
          <div className="border-t border-border p-2">
            <AgentSection />
          </div>
        </details>
      </main>
    </div>
  );
}
