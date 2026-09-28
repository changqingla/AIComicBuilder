"use client";

import { PromptEditor } from "@/components/prompt-templates/prompt-editor";
import { WorkspaceHeader } from "@/components/workspace/header";
import { PageHeader } from "@/components/workspace/page-header";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

export default function PromptSettingsPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") === "project" ? "project" : "global";
  const projectId = searchParams.get("projectId") || undefined;
  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />
      <main className="workspace-page">
        <PageHeader
          title={t("promptTemplates.title")}
          description={t("workspace.promptsHint")}
        />
        <PromptEditor
          scope={scope}
          projectId={projectId}
          initialPromptKey={searchParams.get("prompt") || undefined}
        />
      </main>
    </div>
  );
}
