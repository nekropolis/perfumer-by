"use client";

import { Search, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProductBrandOption } from "@/lib/admin-products-api";
import { adminBtnSecondary, adminInput } from "@/lib/admin-ui-classes";

type Props = {
    value: string;
    brands: ProductBrandOption[];
    onChangeAction: (value: string) => void;
    label?: string;
    placeholder?: string;
};

export default function AdminBrandSelect({
                                             value,
                                             brands,
                                             onChangeAction,
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
            <label className="mb-1.5 block text-sm font-medium text-admin-text">{label}</label>

            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`${adminBtnSecondary} w-full justify-between`}
            >
                <span className={`truncate ${selectedBrand ? "text-admin-text" : "text-admin-text-muted"}`}>
                    {selectedBrand ? selectedBrand.name : placeholder}
                </span>
                <ChevronsUpDown size={16} className="ml-3 shrink-0 text-admin-text-muted" />
            </button>

            {open && (
                <div className="fixed inset-0 z-[200] bg-slate-900/50 px-3 py-4 sm:px-4 sm:py-6">
                    <div className="mx-auto flex h-full w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-xl">
                        <div className="flex items-center justify-between gap-3 border-b border-admin-border px-4 py-3 sm:px-5 sm:py-4">
                            <div className="min-w-0">
                                <div className="text-base font-semibold text-admin-text">Выбор бренда</div>
                                <div className="text-sm text-admin-text-secondary">Найдите и выберите нужный бренд</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className={`${adminBtnSecondary} shrink-0`}
                            >
                                Закрыть
                            </button>
                        </div>

                        <div className="border-b border-admin-border p-4">
                            <div className="relative">
                                <Search
                                    size={16}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-admin-text-muted"
                                />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Поиск бренда..."
                                    className={`${adminInput} pl-9`}
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
                                                    onChangeAction(String(brand.id));
                                                    setOpen(false);
                                                }}
                                                className={`block min-h-10 w-full rounded-lg px-4 py-2.5 text-left text-sm transition ${
                                                    isActive
                                                        ? "bg-admin-primary text-white"
                                                        : "text-admin-text hover:bg-admin-muted"
                                                }`}
                                            >
                                                {brand.name}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-lg border border-dashed border-admin-border px-4 py-6 text-center text-sm text-admin-text-secondary">
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
