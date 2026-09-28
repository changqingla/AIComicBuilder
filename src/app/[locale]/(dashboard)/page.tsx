import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { ProjectCard } from "@/components/project-card";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/workspace/page-header";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tw = await getTranslations("workspace");
  const cookieStore = await cookies();
  const userId = cookieStore.get("ai_comic_uid")?.value ?? "";

  const allProjects = userId
    ? await db
        .select()
        .from(projects)
        .where(eq(projects.userId, userId))
        .orderBy(desc(projects.createdAt))
    : [];

  return (
    <div className="animate-page-in">
      <PageHeader title={t("title")} description={tw("projectsHint")}>
        <CreateProjectDialog />
      </PageHeader>
      {allProjects.length === 0 ? (
        <div className="empty-state min-h-[50vh]">
          <FolderOpen
            className="mb-2 size-10 text-muted-foreground"
            strokeWidth={1.3}
          />
          <h2 className="section-heading">{t("noProjects")}</h2>
          <CreateProjectDialog />
        </div>
      ) : (
        <section
          aria-label={tw("allProjects")}
          className="workspace-panel overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground">
            <span>{tw("projectCount", { count: allProjects.length })}</span>
            <span className="hidden pr-28 sm:block">{tw("createdDate")}</span>
          </div>
          <div className="divide-y divide-border">
            {allProjects.map((project) => (
              <ProjectCard
                key={project.id}
                id={project.id}
                title={project.title}
                status={project.status}
                createdAt={project.createdAt.toISOString()}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
