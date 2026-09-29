"use client";

import { useProjectStore } from "@/stores/project-store";
import { use, useEffect } from "react";

import { WorkspaceShell } from "@/components/workspace/shell";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("common");
  const { project, loading, error, fetchProject } = useProjectStore();

  useEffect(() => {
    fetchProject(id);
  }, [id, fetchProject]);

  if (error)
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>{error}</p>
        <button
          onClick={() => fetchProject(id)}
          className="text-primary underline"
        >
          {t("retry")}
        </button>
      </div>
    );

  if (loading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-[var(--text-muted)]">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return <WorkspaceShell project={project}>{children}</WorkspaceShell>;
}
