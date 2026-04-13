"use client";

import { useMemo, useState } from "react";
import type { ProductBrandOption } from "@/lib/admin-products-api";

type Props = {
    value: string;
    brands: ProductBrandOption[];
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
};

export default function AdminBrandSelect({
                                             value,
                                             brands,
                                             onChange,
                                             label = "Бренд",
                                             placeholder = "Выберите бренд",
                                         }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const selectedBrand = useMemo(
        () => brands.find((brand) => String(brand.id) === value) || null,
        [brands, value]
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
    return (
        <div>
            <label className="mb-1 block text-sm text-gray-600">{label}</label>

            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm"
            >
                <span className={`truncate ${selectedBrand ? "text-black" : "text-gray-400"}`}>
                    {selectedBrand ? selectedBrand.name : placeholder}
                </span>
                <span className="ml-3 text-gray-400">▾</span>
            </button>

            {open && (
                <div className="fixed inset-0 z-50 bg-black/40 px-4 py-6">
                    <div className="mx-auto flex h-full w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div className="text-base font-semibold">Выбор бренда</div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-lg border px-3 py-1 text-sm"
                            >
                                Закрыть
                            </button>
                        </div>

                        <div className="border-b p-4">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Поиск бренда..."
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto p-3">
                            <div className="space-y-1">
                                {filteredBrands.length > 0 ? (
                                    filteredBrands.map((brand) => {
                                        const isActive = String(brand.id) === value;

                                        return (
                                            <button
                                                key={brand.id}
                                                type="button"
                                                onClick={() => {
                                                    onChange(String(brand.id));
                                                    setOpen(false);
                                                }}
                                                className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                                                    isActive
                                                        ? "bg-black text-white"
                                                        : "hover:bg-gray-100"
                                                }`}
                                            >
                                                {brand.name}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="px-3 py-2 text-sm text-gray-500">
                                        Ничего не найдено
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
