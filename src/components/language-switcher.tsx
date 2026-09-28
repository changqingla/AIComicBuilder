"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Globe2 } from "lucide-react";
import { routing } from "@/i18n/routing";

const labels = { zh: "中文", en: "English", ja: "日本語", ko: "한국어" };

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("workspace");
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
      <Globe2 className="size-4" aria-hidden="true" />
      <select
        aria-label={t("language")}
        value={locale}
        className="h-9 max-w-24 rounded-md border-0 bg-transparent text-sm text-foreground"
        onChange={(event) => {
          const segments = pathname.split("/");
          segments[1] = event.target.value;
          router.replace(segments.join("/") + window.location.search);
        }}
      >
        {routing.locales.map((item) => (
          <option key={item} value={item}>
            {labels[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
