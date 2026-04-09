import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/layout/providers";
import AppShell from "@/components/layout/app-shell";

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
        <Providers>
            <AppShell>{children}</AppShell>
        </Providers>
        </body>
        </html>
    );
}