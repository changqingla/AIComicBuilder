import { CreateProjectDialog } from "@/components/create-project-dialog";
import { ProjectCard } from "@/components/project-card";
import { PageHeader } from "@/components/workspace/page-header";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";

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
      <PageHeader title={t("title")}>
        <CreateProjectDialog />
      </PageHeader>
      {allProjects.length === 0 ? (
        <div className="empty-state min-h-[50vh]">
          <h2 className="section-heading">{t("noProjects")}</h2>
        </div>
      ) : (
        <section
          aria-label={tw("allProjects")}
          className="border-b border-border"
        >
          <div className="flex items-center justify-between border-b border-border py-3 text-sm font-medium text-muted-foreground">
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
