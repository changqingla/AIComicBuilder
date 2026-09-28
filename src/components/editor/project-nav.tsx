"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectNav({
  projectId,
  episodeId,
  episodeTitle,
}: {
  projectId: string;
  episodeId: string;
  episodeTitle: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const base = `/${locale}/project/${projectId}/episodes`;
  const stages = ["script", "characters", "storyboard", "preview"] as const;
  return (
    <div className="border-b border-border bg-white px-5 sm:px-8 lg:px-10">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex min-w-0 items-center gap-3 py-2">
          <Link
            href={base}
            aria-label={t("episode.backToList")}
            title={t("episode.backToList")}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <span className="truncate text-sm font-medium" title={episodeTitle}>
            {episodeTitle}
          </span>
        </div>
        <nav
          aria-label={t("workspace.workflow")}
          className="flex w-full items-center justify-between gap-2 sm:w-auto sm:gap-6"
        >
          {stages.map((stage, index) => {
            const href = `${base}/${episodeId}/${stage}`;
            const active = pathname === href;
            return (
              <Link
                key={stage}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 border-transparent py-3 text-sm text-muted-foreground hover:text-foreground",
                  active && "border-primary font-medium text-primary",
                )}
              >
                <span className="font-mono text-xs opacity-60">
                  {index + 1}
                </span>
                {t(`project.${stage}`)}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
