import { apiFetch } from "@/lib/api";
import { groupBrandsByFirstLetter } from "@/lib/brand-letter-groups";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import BrandsDirectory from "@/components/brands/brands-directory";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd } from "@/lib/json-ld";
import type { Metadata } from "next";
import type { CatalogBrandItem, CatalogBrandsResponse } from "@/types/catalog";
import { buildSeoMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildSeoMetadata({
    title: "Бренды парфюмерии",
    description: "Каталог брендов парфюмерии и косметики в ассортименте магазина.",
    canonicalPath: "/brands",
});

export default async function BrandsPage() {
    const brands = await apiFetch<CatalogBrandsResponse>("/catalog/brands");
    const brandGroups = groupBrandsByFirstLetter(brands.data);
    const brandsByLetter = Object.fromEntries(brandGroups) as Record<string, CatalogBrandItem[]>;

    const crumbs = [
        { label: "Главная", href: "/" },
        { label: "Бренды" },
    ] as const;

    return (
        <main className="mx-auto max-w-6xl px-6 py-10">
            <JsonLd data={breadcrumbListJsonLd([...crumbs])} />
            <Breadcrumbs className="mb-4" items={[...crumbs]} />

            <h1 className="mb-8 text-3xl font-semibold">Бренды</h1>

            <BrandsDirectory brandsByLetter={brandsByLetter} />
        </main>
    );
}
