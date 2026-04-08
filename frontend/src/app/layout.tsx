import type { Metadata } from "next";
import "./globals.css";
import SiteShell from "@/components/layout/site-shell";

export const metadata: Metadata = {
  title: "Perfumer",
  description: "Perfumer store",
};

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="ru">
      <body>
      <SiteShell>{children}</SiteShell>
      </body>
      </html>
  );
}