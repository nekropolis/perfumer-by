"use client";

import { useMemo, useState } from "react";
import type { BatchCodeBrand } from "@/types/batch-code";
import { BATCH_CODE_OTHER_BRAND_SLUG } from "@/lib/batch-code-page-content";
import { siteBtnSecondary, siteInput } from "@/lib/site-ui-classes";

type Props = {
    brands: BatchCodeBrand[];
    value: string;
    onChangeAction: (slug: string) => void;
    disabled?: boolean;
    id?: string;
};

export default function BatchCodeBrandSelect({
    brands,
    value,
    onChangeAction,
    disabled = false,
    id,
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const selectedLabel = useMemo(() => {
        if (value === BATCH_CODE_OTHER_BRAND_SLUG) {
            return "Другой бренд";
        }
        return brands.find((b) => b.slug === value)?.name ?? "Выберите бренд";
    }, [brands, value]);

    const filteredBrands = useMemo(() => {
        const q = query.trim().toLowerCase();
        const sorted = [...brands].sort((a, b) => a.name.localeCompare(b.name, "ru"));
        if (!q) {
            return sorted;
        }
        return sorted.filter((brand) => brand.name.toLowerCase().includes(q));
    }, [brands, query]);

    const pick = (slug: string) => {
        onChangeAction(slug);
        setOpen(false);
        setQuery("");
    };

    return (
        <div className="relative">
            <button
                id={id}
                type="button"
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="listbox"
                className={`${siteBtnSecondary} w-full justify-between disabled:opacity-50`}
            >
                <span className="truncate text-left">{selectedLabel}</span>
                <span className="ml-3 shrink-0 text-admin-text-secondary" aria-hidden>
                    ▾
                </span>
            </button>

            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/20"
                        onClick={() => setOpen(false)}
                        aria-hidden
                    />

                    <div
                        className="absolute left-0 top-full z-50 mt-2 w-full rounded-2xl border border-admin-border bg-admin-surface shadow-lg"
                        role="listbox"
                    >
                        <div className="border-b border-admin-border p-3">
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Поиск бренда..."
                                className={siteInput}
                                autoComplete="off"
                            />
                        </div>

                        <div className="max-h-[280px] overflow-y-auto p-2">
                            {filteredBrands.map((brand) => {
                                const isActive = brand.slug === value;
                                return (
                                    <button
                                        key={brand.slug}
                                        type="button"
                                        role="option"
                                        aria-selected={isActive}
                                        onClick={() => pick(brand.slug)}
                                        className={`mb-1 flex w-full rounded-2xl px-3 py-2 text-left text-sm transition ${
                                            isActive
                                                ? "bg-admin-primary font-semibold text-white"
                                                : "text-admin-text hover:bg-admin-muted"
                                        }`}
                                    >
                                        {brand.name}
                                    </button>
                                );
                            })}

                            <button
                                type="button"
                                role="option"
                                aria-selected={value === BATCH_CODE_OTHER_BRAND_SLUG}
                                onClick={() => pick(BATCH_CODE_OTHER_BRAND_SLUG)}
                                className={`mt-1 flex w-full rounded-2xl border border-dashed px-3 py-2 text-left text-sm transition ${
                                    value === BATCH_CODE_OTHER_BRAND_SLUG
                                        ? "border-admin-primary bg-admin-primary/10 font-semibold text-admin-text"
                                        : "border-admin-border text-admin-text-secondary hover:bg-admin-muted hover:text-admin-text"
                                }`}
                            >
                                Другой бренд
                            </button>

                            {filteredBrands.length === 0 && query.trim() ? (
                                <p className="px-3 py-2 text-sm text-admin-text-secondary">
                                    В списке нет совпадений — выберите «Другой бренд».
                                </p>
                            ) : null}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
