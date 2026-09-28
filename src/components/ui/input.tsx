import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2 text-base sm:text-sm text-[var(--text-primary)] transition-colors duration-150 outline-none placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)] focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15 disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
