"use client";

import { Suspense } from "react";
import CatalogBrandSelect from "@/components/catalog/catalog-brand-select";

export default function CatalogFilters() {
    return (
        <>
            <div className="lg:hidden">
                <div className="rounded-2xl border bg-white px-4 py-3 text-sm text-gray-500">
                    Фильтры скоро появятся
                </div>
            </div>

            <div className="hidden lg:block">
                <div className="rounded-2xl border bg-white p-4">
                    <div className="text-base font-semibold">Фильтры</div>
                    <div className="mt-3 text-sm text-gray-500">
                        <Suspense fallback={<span className="text-gray-400">Бренды…</span>}>
                            <CatalogBrandSelect brands={[]} />
                        </Suspense>
                        Фильтры скоро появятся
                    </div>
                </div>
            </div>
        </>
    );
}
