"use client";

import { useMemo, useOptimistic, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";
import { groupBrandsByFirstLetter, orderedLettersWithBrands } from "@/lib/brand-letter-groups";
import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";

import { siteBtnPrimary, siteBtnSecondary, siteFilterChip, siteFilterChipActive, siteFilterChipInactive, siteInput } from "@/lib/site-ui-classes";
import {
    buildCatalogFacetedFiltersResetPath,
    hasCatalogFacetedFilters,
} from "@/lib/catalog-listing-query";

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
    hideReset?: boolean;
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
    hideReset = false,
}: Props) {
    const { navigate } = useCatalogNavigation();
    const searchParams = useSearchParams();

    const [priceMinDraft, setPriceMinDraft] = useState(searchParams.get("price_min") ?? "");
    const [priceMaxDraft, setPriceMaxDraft] = useState(searchParams.get("price_max") ?? "");
    const [brandQuery, setBrandQuery] = useState("");
    const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
    const safeAttributes = Array.isArray(attributes) ? attributes : [];
    const safeVolumeOptions = Array.isArray(volumeOptions) ? volumeOptions : [];
    const [popupAttributeId, setPopupAttributeId] = useState<number | null>(null);
    const [attributeOptionQuery, setAttributeOptionQuery] = useState("");

    const selectedBrandIds = useMemo(
        () =>
            (searchParams.get("brand") || "")
                .split(",")
                .map((v) => Number(v))
                .filter((v) => Number.isInteger(v) && v > 0),
        [searchParams]
    );
    const [optimisticBrandIds, setOptimisticBrandIds] = useOptimistic(selectedBrandIds);
    const hasActiveFilters = useMemo(
        () => hasCatalogFacetedFilters(searchParams),
        [searchParams],
    );

    const pushParams = (mutator: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams.toString());
        mutator(params);
        params.delete("page");
        navigate(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`);
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
        navigate(buildCatalogFacetedFiltersResetPath(basePath, searchParams));
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
    const filteredPopupOptions = useMemo(() => {
        if (!popupAttribute) {
            return [];
        }
        const q = attributeOptionQuery.trim().toLowerCase();
        if (!q) {
            return popupAttribute.options;
        }
        return popupAttribute.options.filter((option) => option.name.toLowerCase().includes(q));
    }, [popupAttribute, attributeOptionQuery]);
    const filteredBrands = useMemo(() => {
        const q = brandQuery.trim().toLowerCase();
        if (!q) {
            return brands;
        }
        return brands.filter((brand) => brand.name.toLowerCase().includes(q));
    }, [brands, brandQuery]);
    const previewBrands = useMemo(() => {
        const selected = brands.filter((brand) => optimisticBrandIds.includes(brand.id));
        const rest = brands.filter((brand) => !optimisticBrandIds.includes(brand.id));
        return [...selected, ...rest].slice(0, Math.max(5, selected.length));
    }, [brands, optimisticBrandIds]);
    const displayBrands = useMemo(() => {
        if (brandQuery.trim()) {
            return filteredBrands.slice(0, 20);
        }
        return previewBrands;
    }, [brandQuery, filteredBrands, previewBrands]);
    const brandGroups = useMemo(() => groupBrandsByFirstLetter(filteredBrands), [filteredBrands]);
    const brandSectionLetters = useMemo(() => orderedLettersWithBrands(brandGroups), [brandGroups]);

    const isBrandSelected = (brandId: number) => optimisticBrandIds.includes(brandId);

    const toggleBrand = (brandId: number) => {
        const next = new Set(optimisticBrandIds);
        if (next.has(brandId)) {
            next.delete(brandId);
        } else {
            next.add(brandId);
        }
        const nextIds = Array.from(next).sort((a, b) => a - b);
        const params = new URLSearchParams(searchParams.toString());
        if (nextIds.length === 0) {
            params.delete("brand");
        } else {
            params.set("brand", nextIds.join(","));
        }
        params.delete("page");
        navigate(
            `${basePath}${params.toString() ? `?${params.toString()}` : ""}`,
            () => setOptimisticBrandIds(nextIds)
        );
    };
    const scrollToBrandLetter = (letter: string) => {
        const target = document.getElementById(`brand-letter-${letter}`);
        target?.scrollIntoView({ block: "start" });
    };

    return (
        <div>
            {!hideReset ? (
                <div className="flex items-center justify-between gap-3 pb-4">
                    {hasActiveFilters ? (
                        <button type="button" onClick={resetFilters} className={`${siteBtnSecondary} w-full text-xs`}>
                            Сбросить фильтры
                        </button>
                    ) : null}
                </div>
            ) : null}

            <div className="divide-y divide-admin-border">
                {showBrandFilter ? (
                    <section className="space-y-3 py-5 first:pt-0">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                            Бренд
                        </div>
                        <input
                            type="text"
                            value={brandQuery}
                            onChange={(e) => setBrandQuery(e.target.value)}
                            placeholder="Поиск бренда"
                            className={siteInput}
                        />
                        <div className="space-y-0.5">
                            {displayBrands.map((brand) => (
                                <label
                                    key={`brand-preview-${brand.id}`}
                                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-admin-text transition hover:bg-admin-muted"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isBrandSelected(brand.id)}
                                        onChange={() => toggleBrand(brand.id)}
                                        suppressHydrationWarning
                                        className="h-4 w-4 rounded border-admin-border accent-admin-primary"
                                    />
                                    <span>{brand.name}</span>
                                </label>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsBrandModalOpen(true)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-admin-primary transition hover:gap-1.5"
                        >
                            Все бренды ({brands.length})
                            <span aria-hidden>→</span>
                        </button>
                    </section>
                ) : null}

                <section className="space-y-3 py-5 first:pt-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                        Цена, BYN
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            inputMode="numeric"
                            placeholder={priceRange.min !== null ? formatPrice(priceRange.min) : "От"}
                            value={priceMinDraft}
                            onChange={(e) => setPriceMinDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") applyPrice(); }}
                            suppressHydrationWarning
                            className={siteInput}
                        />
                        <span className="text-admin-text-secondary">–</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            placeholder={priceRange.max !== null ? formatPrice(priceRange.max) : "До"}
                            value={priceMaxDraft}
                            onChange={(e) => setPriceMaxDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") applyPrice(); }}
                            suppressHydrationWarning
                            className={siteInput}
                        />
                    </div>
                    <button type="button" onClick={applyPrice} className={`${siteBtnPrimary} w-full`}>
                        Применить
                    </button>
                </section>

                {safeVolumeOptions.length > 0 ? (
                    <section className="space-y-3 py-5 first:pt-0">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                            Объем
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {safeVolumeOptions.map((item) => {
                                const active = isVolumeSelected(item.key);
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => toggleVolumeOption(item.key)}
                                        className={`${siteFilterChip} ${active ? siteFilterChipActive : siteFilterChipInactive}`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ) : null}

                {safeAttributes.map((attribute) => (
                    <section key={attribute.id} className="space-y-3 py-5 first:pt-0">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                            {attribute.name}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {attribute.options.slice(0, 6).map((option) => {
                                const active = isOptionSelected(attribute.id, option.id);
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => toggleAttributeOption(attribute.id, option.id)}
                                        className={`${siteFilterChip} ${active ? siteFilterChipActive : siteFilterChipInactive}`}
                                    >
                                        {option.name}
                                    </button>
                                );
                            })}
                        </div>
                        {attribute.options.length > 6 ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setAttributeOptionQuery("");
                                    setPopupAttributeId(attribute.id);
                                }}
                                className="inline-flex items-center gap-1 text-sm font-medium text-admin-primary transition hover:gap-1.5"
                            >
                                Показать все ({attribute.options.length})
                                <span aria-hidden>→</span>
                            </button>
                        ) : null}
                    </section>
                ))}
            </div>

            {popupAttribute ? (
                <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
                    <div className="flex max-h-[min(88dvh,640px)] w-full flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface p-4 shadow-2xl sm:max-w-lg sm:rounded-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-admin-text">{popupAttribute.name}</div>
                            <button
                                type="button"
                                onClick={() => {
                                    setAttributeOptionQuery("");
                                    setPopupAttributeId(null);
                                }}
                                className="rounded-lg px-2 py-1 text-sm text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                            >
                                Закрыть
                            </button>
                        </div>
                        <input
                            type="text"
                            value={attributeOptionQuery}
                            onChange={(e) => setAttributeOptionQuery(e.target.value)}
                            placeholder="Поиск в фильтре"
                            className={`${siteInput} mb-3`}
                        />
                        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                            {filteredPopupOptions.map((option) => (
                                <label
                                    key={option.id}
                                    className="flex cursor-pointer items-center rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text transition hover:bg-admin-muted"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={isOptionSelected(popupAttribute.id, option.id)}
                                            onChange={() => toggleAttributeOption(popupAttribute.id, option.id)}
                                            suppressHydrationWarning
                                            className="h-4 w-4 rounded border-admin-border accent-admin-primary"
                                        />
                                        {option.name}
                                    </span>
                                </label>
                            ))}
                            {filteredPopupOptions.length === 0 ? (
                                <div className="px-2 py-4 text-sm text-admin-text-secondary">Ничего не найдено</div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

            {isBrandModalOpen ? (
                <div
                    className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
                    onClick={() => setIsBrandModalOpen(false)}
                >
                    <div
                        className="flex max-h-[min(92dvh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface p-4 shadow-2xl sm:rounded-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-admin-text">Бренд</div>
                            <button
                                type="button"
                                onClick={() => setIsBrandModalOpen(false)}
                                className="rounded-lg px-2 py-1 text-sm text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                            >
                                Закрыть
                            </button>
                        </div>

                        <input
                            type="text"
                            value={brandQuery}
                            onChange={(e) => setBrandQuery(e.target.value)}
                            placeholder="Поиск бренда"
                            suppressHydrationWarning
                            className={`${siteInput} mb-3`}
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
                                                        className="h-4 w-4 rounded border-[var(--line)] accent-[var(--accent)]"
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
