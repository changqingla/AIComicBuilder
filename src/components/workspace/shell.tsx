"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

export function WorkspaceShell({
  project,
  children,
}: {
  project?: { id: string; title: string };
  children: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const base = `/${locale}`;
  const projectBase = project && `${base}/project/${project.id}`;

  function navLink(href: string, label: string, active = pathname === href) {
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={() => setMenuOpen(false)}
        className={cn("workspace-nav-link", active && "workspace-nav-active")}
      >
        {label}
      </Link>
    );
  }

  return (
    <div className="workspace-shell">
      <header className="workspace-sidebar">
        <div className="flex items-center justify-between gap-3 md:block">
          <Link
            href={base}
            className="text-[15px] font-semibold tracking-tight"
          >
            {t("common.appName")}
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="workspace-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
            className="py-2 text-sm md:hidden"
          >
            {menuOpen ? t("workspace.close") : t("workspace.mainNavigation")}
          </button>
        </div>
        <div
          id="workspace-navigation"
          className={cn(
            "min-h-0 flex-1 flex-col md:flex",
            menuOpen ? "flex" : "hidden",
          )}
        >
          <nav
            aria-label={t("workspace.mainNavigation")}
            className="mt-6 md:mt-10"
          >
            {navLink(base, t("dashboard.title"))}
          </nav>
          {project && (
            <nav aria-label={t("workspace.projectNavigation")} className="mt-8">
              <p className="mb-3 break-words px-3 text-xs leading-6 text-muted-foreground">
                {project.title}
              </p>
              {[
                ["episodes", t("episode.title")],
                ["characters", t("episode.characters")],
                ["import", t("import.title")],
                ["prompts", t("common.promptTemplates")],
              ].map(([path, label]) =>
                navLink(
                  `${projectBase}/${path}`,
                  label,
                  pathname === `${projectBase}/${path}` ||
                    (path === "episodes" &&
                      pathname.startsWith(`${projectBase}/episodes/`)),
                ),
              )}
            </nav>
          )}
          <nav
            aria-label={t("settings.title")}
            className="mt-8 border-t border-border pt-5 md:mt-auto"
          >
            {navLink(`${base}/settings/prompts`, t("promptTemplates.title"))}
            {navLink(`${base}/settings`, t("settings.title"))}
          </nav>
        </div>
        <div
          className={cn("mt-3 px-3 md:mt-4", !menuOpen && "hidden md:block")}
        >
          <LanguageSwitcher />
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
