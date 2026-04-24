import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import Providers from "@/components/layout/providers";
import AppShell from "@/components/layout/app-shell";

const manrope = Manrope({
    subsets: ["latin", "cyrillic"],
    variable: "--font-sans",
});

const cormorant = Cormorant_Garamond({
    subsets: ["latin", "cyrillic"],
    variable: "--font-display",
    weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
    title: "Perfumer",
    description: "Perfumer store",
    icons: {
        icon: [
            { url: "/favicon.svg", type: "image/svg+xml" },
        ],
    },
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ru" suppressHydrationWarning>
        <body className={`${manrope.variable} ${cormorant.variable}`}>
        <Providers>
            <AppShell>{children}</AppShell>
        </Providers>
        </body>
        </html>
    );
}