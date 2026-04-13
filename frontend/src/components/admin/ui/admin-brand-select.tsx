"use client";

import { Search, ChevronsUpDown } from "lucide-react";
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
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>

            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition hover:border-gray-300"
            >
                <span className={`truncate ${selectedBrand ? "text-black" : "text-gray-400"}`}>
                    {selectedBrand ? selectedBrand.name : placeholder}
                </span>
                <ChevronsUpDown size={16} className="ml-3 text-gray-400" />
            </button>

            {open && (
                <div className="fixed inset-0 z-50 bg-black/40 px-4 py-6">
                    <div className="mx-auto flex h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                            <div>
                                <div className="text-base font-semibold text-gray-950">Выбор бренда</div>
                                <div className="text-sm text-gray-500">Найдите и выберите нужный бренд</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-xl border border-gray-200 px-3 py-2 text-sm transition hover:bg-gray-50"
                            >
                                Закрыть
                            </button>
                        </div>

                        <div className="border-b border-gray-100 p-4">
                            <div className="relative">
                                <Search
                                    size={16}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Поиск бренда..."
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 pl-9 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                                />
                            </div>
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
                                                className={`block w-full rounded-xl px-4 py-3 text-left text-sm transition ${
                                                    isActive
                                                        ? "bg-black text-white"
                                                        : "text-gray-700 hover:bg-gray-100"
                                                }`}
                                            >
                                                {brand.name}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
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
