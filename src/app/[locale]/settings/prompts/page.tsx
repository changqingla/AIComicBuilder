"use client";

import { PromptEditor } from "@/components/prompt-templates/prompt-editor";
import { PageHeader } from "@/components/workspace/page-header";
import { WorkspaceShell } from "@/components/workspace/shell";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

export default function PromptSettingsPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") === "project" ? "project" : "global";
  const projectId = searchParams.get("projectId") || undefined;
  return (
    <WorkspaceShell>
      <div className="workspace-page">
        <PageHeader title={t("promptTemplates.title")} />
        <PromptEditor
          scope={scope}
          projectId={projectId}
          initialPromptKey={searchParams.get("prompt") || undefined}
        />
      </div>
    </WorkspaceShell>
  );
}
