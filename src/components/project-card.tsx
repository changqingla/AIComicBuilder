"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowRight, Folder, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

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
      <article className="group flex items-center gap-2 px-4 py-1 transition-colors hover:bg-muted/40 sm:px-5">
        <Link
          href={`/${locale}/project/${id}/episodes`}
          className="flex min-w-0 flex-1 items-center gap-4 py-5 sm:gap-5"
        >
          <Folder
            className="size-6 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium text-foreground group-hover:text-primary">
              {title}
            </h2>
            <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`size-1.5 rounded-full ${status === "completed" ? "bg-[var(--success)]" : status === "processing" ? "bg-[var(--warning)]" : "bg-slate-400"}`}
              />
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
            className="hidden text-sm tabular-nums text-muted-foreground sm:block"
          >
            {new Date(createdAt).toLocaleDateString(locale, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })}
          </time>
          <ArrowRight className="ml-2 size-4 shrink-0 text-muted-foreground sm:mx-5" />
        </Link>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`${tc("delete")} ${title}`}
          title={tc("delete")}
          onClick={() => setDeleteOpen(true)}
          className="hover:text-destructive"
        >
          <Trash2 className="size-4" />
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
