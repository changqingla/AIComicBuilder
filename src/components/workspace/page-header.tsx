import type { ReactNode } from "react";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 className="page-heading">{title}</h1>
      {children && <div className="toolbar">{children}</div>}
    </div>
  );
}
