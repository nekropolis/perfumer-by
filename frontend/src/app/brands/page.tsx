import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { CatalogBrandsResponse } from "@/types/catalog";

export default async function BrandsPage() {
    const brands = await apiFetch<CatalogBrandsResponse>("/catalog/brands");

    return (
        <main className="max-w-6xl mx-auto px-6 py-10">
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Главная", href: "/" },
                    { label: "Бренды" },
                ]}
            />

            <h1 className="mb-8 text-3xl font-semibold">Бренды</h1>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {brands.data.map((brand) => (
                    <Link
                        key={brand.id}
                        href={`/brands/${brand.slug}`}
                        className="rounded-2xl border bg-white px-4 py-3 text-sm hover:shadow-sm transition"
                    >
                        {brand.name}
                    </Link>
                ))}
            </div>
        </main>
    );
}
