"use client";

import { use } from "react";
import { ProjectPromptCards } from "@/components/prompt-templates/project-prompt-cards";
import { PageHeader } from "@/components/workspace/page-header";
import { useTranslations } from "next-intl";

export default function ProjectPromptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  return (
    <main className="workspace-page">
      <PageHeader
        title={t("promptTemplates.title")}
        description={t("workspace.promptsHint")}
      />
      <ProjectPromptCards projectId={id} />
    </main>
  );
}
