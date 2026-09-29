"use client";

import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectNav({
  projectId,
  episodeId,
  episodeTitle,
  versionId,
}: {
  projectId: string;
  episodeId: string;
  episodeTitle: string;
  versionId: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const base = `/${locale}/project/${projectId}/episodes`;
  const stages = ["script", "characters", "storyboard", "preview"] as const;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 border-b border-border px-5 pt-3 sm:px-8 lg:px-10">
      <Link
        href={base}
        title={t("episode.backToList")}
        className="min-w-0 break-words py-3 text-sm text-muted-foreground hover:text-foreground"
      >
        {episodeTitle}
      </Link>
      <nav
        aria-label={t("workspace.workflow")}
        className="flex max-w-full flex-wrap gap-5 sm:gap-7"
      >
        {stages.map((stage) => {
          const path = `${base}/${episodeId}/${stage}`;
          const href =
            stage === "preview" && versionId
              ? `${path}?versionId=${encodeURIComponent(versionId)}`
              : path;
          return (
            <Link
              key={stage}
              href={href}
              aria-current={pathname === path ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 border-transparent py-3 text-sm text-muted-foreground hover:text-foreground",
                pathname === path && "border-foreground text-foreground",
              )}
            >
              {t(`project.${stage}`)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
