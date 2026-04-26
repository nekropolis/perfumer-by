import { apiFetch } from "@/lib/api";
import { groupBrandsByFirstLetter } from "@/lib/brand-letter-groups";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import BrandsDirectory from "@/components/brands/brands-directory";
import type { CatalogBrandItem, CatalogBrandsResponse } from "@/types/catalog";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
    const brands = await apiFetch<CatalogBrandsResponse>("/catalog/brands");
    const brandGroups = groupBrandsByFirstLetter(brands.data);
    const brandsByLetter = Object.fromEntries(brandGroups) as Record<string, CatalogBrandItem[]>;

    return (
        <main className="mx-auto max-w-6xl px-6 py-10">
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Главная", href: "/" },
                    { label: "Бренды" },
                ]}
            />

            <h1 className="mb-8 text-3xl font-semibold">Бренды</h1>

            <BrandsDirectory brandsByLetter={brandsByLetter} />
        </main>
    );
}
