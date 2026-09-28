"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen, ChevronRight, FolderOpen, Settings2 } from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

export function WorkspaceHeader({
  project,
}: {
  project?: { id: string; title: string };
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const links = [
    { href: `/${locale}`, label: t("dashboard.title"), icon: FolderOpen },
    {
      href: `/${locale}/settings/prompts`,
      label: t("promptTemplates.editPrompt"),
      icon: BookOpen,
    },
    {
      href: `/${locale}/settings`,
      label: t("settings.title"),
      icon: Settings2,
    },
  ];
  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-white px-5 py-3 sm:px-8 lg:px-10">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href={`/${locale}`}
          aria-label={t("common.appName")}
          className="flex shrink-0 items-center gap-2.5 text-foreground"
        >
          <LogoIcon size={26} />
          <span
            className={cn(
              "text-sm font-semibold tracking-tight",
              project && "hidden xl:inline",
            )}
          >
            {t("common.appName")}
          </span>
        </Link>
        {project && (
          <>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            <Link
              href={`/${locale}/project/${project.id}/episodes`}
              className="truncate text-sm font-medium"
              title={project.title}
            >
              {project.title}
            </Link>
          </>
        )}
      </div>
      <nav
        aria-label={t("workspace.mainNavigation")}
        className="order-3 flex w-full items-center gap-1 overflow-x-auto border-t border-border pt-2 md:order-none md:w-auto md:border-0 md:pt-0"
      >
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(
              "subtle-link flex-1 justify-center whitespace-nowrap px-2 md:flex-none md:px-3",
              pathname === href && "bg-secondary text-foreground",
            )}
          >
            <Icon className="hidden size-4 shrink-0 sm:block" />
            {label}
          </Link>
        ))}
      </nav>
      <LanguageSwitcher />
    </header>
  );
}
