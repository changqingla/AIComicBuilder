"use client";

import { ProjectPromptCards } from "@/components/prompt-templates/project-prompt-cards";
import { PageHeader } from "@/components/workspace/page-header";
import { useTranslations } from "next-intl";
import { use } from "react";

export default function ProjectPromptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  return (
    <main className="workspace-page">
      <PageHeader title={t("promptTemplates.title")} />
      <ProjectPromptCards projectId={id} />
    </main>
  );
}
