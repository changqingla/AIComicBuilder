"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function ProjectSections({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();
  const base = `/${locale}/project/${projectId}`;
  if (pathname.startsWith(`${base}/episodes/`)) return null;
  const sections = [
    ["episodes", t("episode.title")],
    ["characters", t("episode.characters")],
    ["import", t("import.title")],
    ["prompts", t("common.promptTemplates")],
  ];
  return (
    <nav
      aria-label={t("workspace.projectNavigation")}
      className="flex gap-5 overflow-x-auto border-b border-border bg-white px-5 sm:gap-7 sm:px-8 lg:px-10"
    >
      {sections.map(([path, label]) => (
        <Link
          key={path}
          href={`${base}/${path}`}
          aria-current={pathname === `${base}/${path}` ? "page" : undefined}
          className={cn(
            "shrink-0 border-b-2 border-transparent py-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
            pathname === `${base}/${path}` &&
              "border-primary font-medium text-primary",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
