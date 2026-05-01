import type { ReactNode } from "react";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import { buildSeoMetadata } from "@/lib/seo";

const giftCertCrumbs = [
    { label: "Главная", href: "/" },
    { label: "Подарочные сертификаты" },
];

export const metadata: Metadata = buildSeoMetadata({
    title: "Подарочные сертификаты",
    description:
        "Подарочные сертификаты парфюмерного магазина Perfumer: номиналы и условия использования.",
    canonicalPath: "/gift-certificates",
});

export default function GiftCertificatesLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <JsonLd data={breadcrumbListJsonLd(giftCertCrumbs)} />
            {children}
        </>
    );
}
