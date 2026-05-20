"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";
import { groupBrandsByFirstLetter, orderedLettersWithBrands } from "@/lib/brand-letter-groups";

type Props = {
    brands: CatalogBrandItem[];
    basePath: string;
    showBrandFilter: boolean;
    attributes: CatalogFilterAttribute[];
    priceRange: {
        min: number | null;
        max: number | null;
    };
    volumeOptions: {
        key: string;
        label: string;
        products_count: number;
    }[];
};

function formatPrice(value: number) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export default function CatalogFilters({
    brands,
    basePath,
    showBrandFilter,
    attributes,
    priceRange,
    volumeOptions,
}: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [priceMinDraft, setPriceMinDraft] = useState(searchParams.get("price_min") ?? "");
    const [priceMaxDraft, setPriceMaxDraft] = useState(searchParams.get("price_max") ?? "");
    const [brandQuery, setBrandQuery] = useState("");
    const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
    const safeAttributes = Array.isArray(attributes) ? attributes : [];
    const safeVolumeOptions = Array.isArray(volumeOptions) ? volumeOptions : [];
    const [popupAttributeId, setPopupAttributeId] = useState<number | null>(null);

    const selectedBrandIds = useMemo(
        () =>
            (searchParams.get("brand") || "")
                .split(",")
                .map((v) => Number(v))
                .filter((v) => Number.isInteger(v) && v > 0),
        [searchParams]
    );
    const hasActiveFilters = useMemo(
        () => Array.from(searchParams.keys()).some((key) => key !== "page" && key !== "sort"),
        [searchParams]
    );

    const pushParams = (mutator: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams.toString());
        mutator(params);
        params.delete("page");
        router.push(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    };

    const toggleAttributeOption = (attributeId: number, optionId: number) => {
        const key = `attr_${attributeId}`;
        pushParams((params) => {
            const selected = new Set(
                (params.get(key) || "")
                    .split(",")
                    .map((v) => Number(v))
                    .filter((v) => Number.isInteger(v) && v > 0)
            );

            if (selected.has(optionId)) {
                selected.delete(optionId);
            } else {
                selected.add(optionId);
            }

            if (selected.size === 0) {
                params.delete(key);
            } else {
                params.set(key, Array.from(selected).sort((a, b) => a - b).join(","));
            }
        });
    };

    const resetFilters = () => {
        router.push(basePath);
    };

    const applyPrice = () => {
        pushParams((params) => {
            if (priceMinDraft.trim()) {
                params.set("price_min", priceMinDraft.trim());
            } else {
                params.delete("price_min");
            }
            if (priceMaxDraft.trim()) {
                params.set("price_max", priceMaxDraft.trim());
            } else {
                params.delete("price_max");
            }
        });
    };

    const isOptionSelected = (attributeId: number, optionId: number) => {
        const selected = searchParams.get(`attr_${attributeId}`);
        if (!selected) {
            return false;
        }
        return selected.split(",").map((v) => Number(v)).includes(optionId);
    };

    const isVolumeSelected = (bucketKey: string) => {
        const selected = searchParams.get("volume");
        if (!selected) {
            return false;
        }
        return selected.split(",").includes(bucketKey);
    };

    const toggleVolumeOption = (bucketKey: string) => {
        pushParams((params) => {
            const selected = new Set(
                (params.get("volume") || "")
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
            );
            if (selected.has(bucketKey)) {
                selected.delete(bucketKey);
            } else {
                selected.add(bucketKey);
            }

            if (selected.size === 0) {
                params.delete("volume");
            } else {
                params.set("volume", Array.from(selected).join(","));
            }
        });
    };

    const popupAttribute = safeAttributes.find((item) => item.id === popupAttributeId) ?? null;
    const filteredBrands = useMemo(() => {
        const q = brandQuery.trim().toLowerCase();
        if (!q) {
            return brands;
        }
        return brands.filter((brand) => brand.name.toLowerCase().includes(q));
    }, [brands, brandQuery]);
    const previewBrands = useMemo(() => brands.slice(0, 5), [brands]);
    const brandGroups = useMemo(() => groupBrandsByFirstLetter(filteredBrands), [filteredBrands]);
    const brandSectionLetters = useMemo(() => orderedLettersWithBrands(brandGroups), [brandGroups]);

    const isBrandSelected = (brandId: number) => selectedBrandIds.includes(brandId);

    const toggleBrand = (brandId: number) => {
        pushParams((params) => {
            const next = new Set(
                (params.get("brand") || "")
                    .split(",")
                    .map((v) => Number(v))
                    .filter((v) => Number.isInteger(v) && v > 0)
            );
            if (next.has(brandId)) {
                next.delete(brandId);
            } else {
                next.add(brandId);
            }
            if (next.size === 0) {
                params.delete("brand");
            } else {
                params.set("brand", Array.from(next).sort((a, b) => a - b).join(","));
            }
        });
    };
    const scrollToBrandLetter = (letter: string) => {
        const target = document.getElementById(`brand-letter-${letter}`);
        target?.scrollIntoView({ block: "start" });
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                {hasActiveFilters ? (
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--foreground)]"
                    >
                        Очистить всё
                    </button>
                ) : null}
            </div>

            {showBrandFilter ? (
                <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Бренд
                    </div>
                    <div className="space-y-1">
                        {previewBrands.map((brand) => (
                            <label
                                key={`brand-preview-${brand.id}`}
                                className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={isBrandSelected(brand.id)}
                                        onChange={() => toggleBrand(brand.id)}
                                        suppressHydrationWarning
                                        className="h-4 w-4 rounded border-[var(--line)]"
                                    />
                                    {brand.name}
                                </span>
                            </label>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsBrandModalOpen(true)}
                        className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"
                    >
                        <span>Все {brands.length} варианта</span>
                        <span>›</span>
                    </button>
                </div>
            ) : null}

            <div className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--background)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Цена
                </div>
                {priceRange.min !== null && priceRange.max !== null ? (
                    <div className="text-xs text-[var(--text-secondary)]">
                        Диапазон: {formatPrice(priceRange.min)} - {formatPrice(priceRange.max)} BYN
                    </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="number"
                        placeholder="От"
                        value={priceMinDraft}
                        onChange={(e) => setPriceMinDraft(e.target.value)}
                        suppressHydrationWarning
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-soft)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    />
                    <input
                        type="number"
                        placeholder="До"
                        value={priceMaxDraft}
                        onChange={(e) => setPriceMaxDraft(e.target.value)}
                        suppressHydrationWarning
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-soft)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    />
                </div>
                <button
                    type="button"
                    onClick={applyPrice}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"
                >
                    Применить цену
                </button>
            </div>

            <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Объем
                </div>
                <div className="space-y-1">
                    {safeVolumeOptions.map((item) => (
                        <label
                            key={item.key}
                            className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
                        >
                            <span className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={isVolumeSelected(item.key)}
                                    onChange={() => toggleVolumeOption(item.key)}
                                    suppressHydrationWarning
                                    className="h-4 w-4 rounded border-[var(--line)]"
                                />
                                {item.label}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)]">{item.products_count}</span>
                        </label>
                    ))}
                </div>
            </div>

            {safeAttributes.map((attribute) => (
                <div key={attribute.id} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        {attribute.name}
                    </div>
                    <div className="space-y-1">
                        {attribute.options.slice(0, 4).map((option) => (
                            <label
                                key={option.id}
                                className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={isOptionSelected(attribute.id, option.id)}
                                        onChange={() => toggleAttributeOption(attribute.id, option.id)}
                                        suppressHydrationWarning
                                        className="h-4 w-4 rounded border-[var(--line)]"
                                    />
                                    {option.name}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)]">{option.products_count}</span>
                            </label>
                        ))}
                        {attribute.options.length > 4 ? (
                            <button
                                type="button"
                                onClick={() => setPopupAttributeId(attribute.id)}
                                className="w-full rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"
                            >
                                Показать все ({attribute.options.length})
                            </button>
                        ) : null}
                    </div>
                </div>
            ))}

            {popupAttribute ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-[var(--foreground)]">{popupAttribute.name}</div>
                            <button
                                type="button"
                                onClick={() => setPopupAttributeId(null)}
                                className="rounded-lg px-2 py-1 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
                            {popupAttribute.options.map((option) => (
                                <label
                                    key={option.id}
                                    className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={isOptionSelected(popupAttribute.id, option.id)}
                                            onChange={() => toggleAttributeOption(popupAttribute.id, option.id)}
                                            suppressHydrationWarning
                                            className="h-4 w-4 rounded border-[var(--line)]"
                                        />
                                        {option.name}
                                    </span>
                                    <span className="text-xs text-[var(--text-secondary)]">{option.products_count}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            {isBrandModalOpen ? (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
                    onClick={() => setIsBrandModalOpen(false)}
                >
                    <div
                        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-[var(--foreground)]">Бренд</div>
                            <button
                                type="button"
                                onClick={() => setIsBrandModalOpen(false)}
                                className="rounded-lg px-2 py-1 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                            >
                                Закрыть
                            </button>
                        </div>

                        <input
                            type="text"
                            value={brandQuery}
                            onChange={(e) => setBrandQuery(e.target.value)}
                            placeholder="Поиск"
                            suppressHydrationWarning
                            className="mb-3 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-soft)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        />

                        <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--line)] pb-3">
                            {brandSectionLetters.map((letter) => (
                                <button
                                    key={`anchor-${letter}`}
                                    type="button"
                                    onClick={() => scrollToBrandLetter(letter)}
                                    className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                >
                                    {letter}
                                </button>
                            ))}
                        </div>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                            {brandSectionLetters.map((letter) => (
                                <div key={`group-${letter}`} id={`brand-letter-${letter}`} className="space-y-1">
                                    <div className="sticky top-0 z-10 bg-[var(--surface)] py-1 text-xs font-semibold text-[var(--text-secondary)]">
                                        {letter}
                                    </div>
                                    <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 lg:grid-cols-3">
                                        {(brandGroups.get(letter) ?? []).map((brand) => (
                                            <label
                                                key={`brand-modal-${brand.id}`}
                                                className="flex cursor-pointer items-center rounded-lg px-2 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={isBrandSelected(brand.id)}
                                                        onChange={() => toggleBrand(brand.id)}
                                                        suppressHydrationWarning
                                                        className="h-4 w-4 rounded border-[var(--line)]"
                                                    />
                                                    {brand.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
