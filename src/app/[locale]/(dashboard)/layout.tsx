import { WorkspaceHeader } from "@/components/workspace/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />
      <main className="workspace-page">{children}</main>
    </div>
  );
}
