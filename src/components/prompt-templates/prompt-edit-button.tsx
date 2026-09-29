"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PromptDrawer } from "./prompt-drawer";

interface PromptEditButtonProps {
  promptKeys: string | string[];
  projectId?: string;
  /** Custom label; defaults to prompt template name */
  label?: string;
  variant?: "ghost" | "outline";
  size?: "xs" | "sm";
}

export function PromptEditButton({
  promptKeys,
  projectId,
  label,
  variant = "ghost",
  size = "sm",
}: PromptEditButtonProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("promptTemplates");

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label ?? t("editPrompt")}
      </Button>
      <PromptDrawer
        open={open}
        onOpenChange={setOpen}
        promptKeys={promptKeys}
        projectId={projectId}
      />
    </>
  );
}
