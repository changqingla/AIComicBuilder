import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <h1 className="page-heading">{title}</h1>
        {description && (
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {children && <div className="toolbar">{children}</div>}
    </div>
  );
}
