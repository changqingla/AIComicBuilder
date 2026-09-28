import { cn } from "@/lib/utils";

export function LogoIcon({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="2"
        y="3"
        width="24"
        height="22"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M12 3v22M12 13h14" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m5.5 18 3-3.5 3.5 5M16 9h6M16 18h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoFull({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 text-foreground", className)}>
      <LogoIcon />
      <span className="text-sm font-semibold">AI Comic Builder</span>
    </div>
  );
}
