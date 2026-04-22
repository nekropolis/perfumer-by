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
            { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
            { url: "/favicon-512x512.png", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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