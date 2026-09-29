"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border border-input bg-white text-foreground hover:border-[var(--border-hover)] hover:bg-secondary",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-muted",
        ghost:
          "border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        destructive:
          "border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-2 px-4 text-sm rounded-md",
        xs: "h-7 gap-1 px-2.5 text-xs rounded-md [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 text-sm rounded-md",
        lg: "h-11 gap-2 px-6 text-base rounded-md",
        icon: "size-9 rounded-md",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-11 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
