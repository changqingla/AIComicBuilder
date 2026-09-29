"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

const ACCEPTED = ".txt,.docx,.pdf,.md,.markdown";
const MAX_SIZE = 20 * 1024 * 1024;

export function FileUpload({
  onStart,
  disabled,
}: {
  onStart: (file: File) => void;
  disabled: boolean;
}) {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  function handleFile(file: File) {
    if (file.size > MAX_SIZE) {
      toast.error(t("fileTooLarge"));
      return;
    }
    setFile(file);
  }
  return (
    <div className="w-full space-y-5">
      {/* Drop zone */}
      <div
        className={`relative flex min-h-48 cursor-pointer flex-col items-start justify-center border-y border-border py-8 transition-colors ${
          dragOver
            ? "border-primary bg-muted"
            : file
              ? "border-border bg-white"
              : "border-[var(--border-subtle)] bg-white"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          tabIndex={-1}
          accept={ACCEPTED}
          aria-label={t("dropHint")}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {file ? (
          <div className="flex min-w-0 max-w-full items-center gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-[var(--text-primary)]">
                {file.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              aria-label={tc("delete")}
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
            >
              {tc("delete")}
            </button>
          </div>
        ) : (
          <>
            <p className="break-words text-sm font-medium text-[var(--text-primary)]">
              {t("dropHint")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("supportedFormats")}
            </p>
          </>
        )}
      </div>

      <Button
        onClick={() => file && onStart(file)}
        disabled={!file || disabled}
        className="flex w-full sm:w-auto"
        size="default"
      >
        {t("startImport")}
      </Button>
    </div>
  );
}
