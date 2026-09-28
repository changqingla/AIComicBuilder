import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Comic Builder",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
