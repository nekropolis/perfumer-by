"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCatalogSearchParams } from "@/components/catalog/catalog-search-params";
import type { CatalogBrandItem } from "@/types/catalog";
import { siteBtnSecondary, siteInput } from "@/lib/site-ui-classes";

type Props = {
    brands: CatalogBrandItem[];
    selectedBrandId?: string;
    basePath?: string;
};

export default function CatalogBrandSelect({ brands, selectedBrandId, basePath = "/catalog" }: Props) {
    const router = useRouter();
    const searchParams = useCatalogSearchParams();

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const selectedBrand = useMemo(
        () => brands.find((brand) => String(brand.id) === selectedBrandId) || null,
        [brands, selectedBrandId]
    );

    const filteredBrands = useMemo(() => {
        const q = query.trim().toLowerCase();

        if (!q) {
            return brands.slice(0, 50);
        }

        return brands
            .filter((brand) => brand.name.toLowerCase().includes(q))
            .slice(0, 100);
    }, [brands, query]);

    const applyBrand = (brandId?: string) => {
        const params = new URLSearchParams(searchParams.toString());

        params.delete("page");

        if (brandId) {
            params.set("brand", brandId);
        } else {
            params.delete("brand");
        }

        router.push(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`);
        setOpen(false);
    };
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`${siteBtnSecondary} w-full justify-between`}
            >
                <span className="truncate">
                    {selectedBrand ? selectedBrand.name : "Выберите бренд"}
                </span>
                <span className="ml-3 text-admin-text-secondary">▾</span>
            </button>

            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/20 lg:bg-transparent"
                        onClick={() => setOpen(false)}
                    />

                    <div className="absolute left-0 top-full z-50 mt-2 w-full rounded-2xl border border-admin-border bg-admin-surface shadow-lg lg:min-w-[320px]">
                        <div className="border-b border-admin-border p-3">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Поиск бренда..."
                                className={siteInput}
                            />
                        </div>

                        <div className="max-h-[320px] overflow-y-auto p-2">
                            <button
                                type="button"
                                onClick={() => applyBrand()}
                                className={`mb-1 flex w-full rounded-2xl px-3 py-2 text-left text-sm ${
                                    !selectedBrandId ? "bg-[var(--accent)] font-semibold text-[var(--background)]" : "text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                                }`}
                            >
                                Все бренды
                            </button>

                            {filteredBrands.length > 0 ? (
                                filteredBrands.map((brand) => {
                                    const isActive = String(brand.id) === selectedBrandId;

                                    return (
                                        <button
                                            key={brand.id}
                                            type="button"
                                            onClick={() => applyBrand(String(brand.id))}
                                            className={`mb-1 flex w-full rounded-2xl px-3 py-2 text-left text-sm ${
                                                isActive ? "bg-[var(--accent)] font-semibold text-[var(--background)]" : "text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                                            }`}
                                        >
                                            {brand.name}
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="px-3 py-2 text-sm text-[var(--text-secondary)]">
                                    Ничего не найдено
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
