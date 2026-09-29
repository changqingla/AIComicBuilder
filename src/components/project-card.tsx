"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-fetch";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProjectCardProps {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export function ProjectCard({
  id,
  title,
  status,
  createdAt,
}: ProjectCardProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteOpen(false);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <article className="group flex items-center gap-4 py-2 transition-colors hover:bg-muted/40">
        <Link
          href={`/${locale}/project/${id}/episodes`}
          className="flex min-w-0 flex-1 items-center gap-4 py-5 sm:gap-5"
        >
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium text-foreground group-hover:text-primary">
              {title}
            </h2>
            <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {t(
                `projectStatus.${status}` as
                  | "projectStatus.draft"
                  | "projectStatus.processing"
                  | "projectStatus.completed",
              )}
            </span>
          </div>
          <time
            dateTime={createdAt}
            className="hidden text-sm tabular-nums text-muted-foreground sm:block sm:pr-12"
          >
            {new Date(createdAt).toLocaleDateString(locale, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })}
          </time>
        </Link>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${tc("delete")} ${title}`}
          title={tc("delete")}
          onClick={() => setDeleteOpen(true)}
          className="hover:text-destructive"
        >
          {tc("delete")}
        </Button>
      </article>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDesc", { title })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {tc("cancel")}
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? tc("loading") : tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
