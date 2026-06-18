import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import Providers from "@/components/layout/providers";
import AppShell from "@/components/layout/app-shell";
import Footer from "@/components/layout/footer";
import JsonLd from "@/components/seo/json-ld";
import { localBusinessJsonLd, organizationJsonLd, webSiteJsonLd } from "@/lib/json-ld";
import { getSiteDefaultRobots, getSiteUrl } from "@/lib/seo";
import { DEFAULT_SITE_CONTENT, fetchSiteContent } from "@/lib/site-content-api";

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
    metadataBase: new URL(getSiteUrl()),
    title: "Perfumer",
    description: "Perfumer store",
    robots: getSiteDefaultRobots(),
    icons: {
        icon: [
            { url: "/favicon.svg", type: "image/svg+xml" },
        ],
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

export default async function RootLayout({
                                               children,
                                           }: Readonly<{
    children: React.ReactNode;
}>) {
    let organizationLd: ReturnType<typeof organizationJsonLd> | ReturnType<typeof localBusinessJsonLd> =
        organizationJsonLd();
    let siteContent = DEFAULT_SITE_CONTENT;
    try {
        const site = await fetchSiteContent();
        siteContent = site.data;
        organizationLd = localBusinessJsonLd(siteContent);
    } catch {
        /* API недоступен — дефолты и базовый Organization */
    }

    return (
        <html lang="ru" suppressHydrationWarning>
        <body className={`${manrope.variable} ${cormorant.variable}`}>
        <JsonLd data={[organizationLd, webSiteJsonLd()]} />
        <Providers siteContent={siteContent}>
            <AppShell footer={<Footer siteContent={siteContent} />}>{children}</AppShell>
        </Providers>
        </body>
        </html>
    );
}