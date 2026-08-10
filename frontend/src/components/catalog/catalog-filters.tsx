"use client";

import { useEffect, useMemo, useOptimistic, useState, type RefObject } from "react";
import { useCatalogSearchParams } from "@/components/catalog/catalog-search-params";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";
import { groupBrandsByFirstLetter, orderedLettersWithBrands } from "@/lib/brand-letter-groups";
import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";
import { useSiteContent } from "@/components/layout/site-content-context";

import { siteBtnPrimary, siteBtnSecondary, siteFilterChip, siteFilterChipActive, siteFilterChipInactive, siteInput, siteCheckbox } from "@/lib/site-ui-classes";
import {
    buildCatalogFacetedFiltersResetPath,
    CATALOG_GENDER_ATTRIBUTE_ID,
    getActiveCatalogGender,
    getCatalogGenderBucketByOptionId,
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
    variant?: "default" | "modal";
    priceApplyRef?: RefObject<(() => void) | null>;
};

export default function CatalogFilters({
    brands,
    basePath,
    showBrandFilter,
    attributes,
    priceRange,
    volumeOptions,
    hideReset = false,
    variant = "default",
    priceApplyRef,
}: Props) {
    const { navigate } = useCatalogNavigation();
    const searchParams = useCatalogSearchParams();
    const siteContent = useSiteContent();

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
        const genderBucket = attributeId === CATALOG_GENDER_ATTRIBUTE_ID
            ? getCatalogGenderBucketByOptionId(optionId)
            : null;

        pushParams((params) => {
            if (genderBucket) {
                const isActive = getActiveCatalogGender(params) === genderBucket;
                params.delete(`attr_${CATALOG_GENDER_ATTRIBUTE_ID}`);

                if (isActive) {
                    params.delete("gender");
                } else {
                    params.set("gender", genderBucket);
                }
                return;
            }

            const key = `attr_${attributeId}`;
            const selected = new Set(
                (params.get(key) || "")
                    .split(",")
                    .map((v) => Number(v))
                    .filter((v) => Number.isInteger(v) && v > 0),
            );

            if (selected.has(optionId)) {
                selected.delete(optionId);
            } else {
                selected.add(optionId);
            }

            if (attributeId === CATALOG_GENDER_ATTRIBUTE_ID) {
                params.delete("gender");
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

    useEffect(() => {
        if (priceApplyRef) {
            priceApplyRef.current = applyPrice;
        }
    });

    const isOptionSelected = (attributeId: number, optionId: number) => {
        if (attributeId === CATALOG_GENDER_ATTRIBUTE_ID) {
            const genderBucket = getCatalogGenderBucketByOptionId(optionId);
            if (genderBucket) {
                return getActiveCatalogGender(searchParams) === genderBucket;
            }
        }

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

    const isFlagSelected = (key: "tester" | "miniature" | "set") => searchParams.get(key) === "1";

    const toggleFlag = (key: "tester" | "miniature" | "set") => {
        pushParams((params) => {
            if (params.get(key) === "1") {
                params.delete(key);
            } else {
                params.set(key, "1");
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
        const selectedIds = new Set(selected.map((brand) => brand.id));
        const brandsById = new Map(brands.map((brand) => [brand.id, brand]));

        const configured = (siteContent.filter_popular_brands ?? [])
            .map((item) => brandsById.get(item.id))
            .filter((brand): brand is CatalogBrandItem => Boolean(brand) && !selectedIds.has(brand.id));

        const configuredIds = new Set(configured.map((brand) => brand.id));
        const rest = brands.filter(
            (brand) => !selectedIds.has(brand.id) && !configuredIds.has(brand.id),
        );
        const filler = configured.length > 0 ? [...configured, ...rest] : rest;

        return [...selected, ...filler].slice(0, Math.max(5, selected.length));
    }, [brands, optimisticBrandIds, siteContent.filter_popular_brands]);
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

    const isModal = variant === "modal";
    const sectionTitleClass = isModal
        ? "text-[11px] font-semibold uppercase tracking-[0.14em] text-admin-text-secondary"
        : "text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary";
    const checkboxClass = siteCheckbox;

    const renderCheckboxOption = (
        key: string,
        label: string,
        checked: boolean,
        onToggle: () => void,
    ) => (
        <label
            key={key}
            className="flex cursor-pointer items-center gap-3 rounded-lg py-1.5 text-sm text-admin-text"
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={onToggle}
                suppressHydrationWarning
                className={checkboxClass}
            />
            <span>{label}</span>
        </label>
    );

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

            <div className={isModal ? "space-y-6" : "divide-y divide-admin-border"}>
                {showBrandFilter ? (
                    <section className={isModal ? "space-y-3" : "space-y-3 py-5 first:pt-0"}>
                        <div className={sectionTitleClass}>
                            Бренд
                        </div>
                        {!isModal ? (
                            <input
                                type="text"
                                value={brandQuery}
                                onChange={(e) => setBrandQuery(e.target.value)}
                                placeholder="Поиск бренда"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-form-type="other"
                                suppressHydrationWarning
                                className={siteInput}
                            />
                        ) : null}
                        <div className={isModal ? "space-y-0.5" : "space-y-0.5"}>
                            {displayBrands.map((brand) =>
                                isModal
                                    ? renderCheckboxOption(
                                        `brand-preview-${brand.id}`,
                                        brand.name,
                                        isBrandSelected(brand.id),
                                        () => toggleBrand(brand.id),
                                    )
                                    : (
                                        <label
                                            key={`brand-preview-${brand.id}`}
                                            className="flex cursor-pointer items-center gap-2.5 rounded-2xl px-2 py-1.5 text-sm text-admin-text transition hover:bg-admin-muted"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isBrandSelected(brand.id)}
                                                onChange={() => toggleBrand(brand.id)}
                                                suppressHydrationWarning
                                                className={checkboxClass}
                                            />
                                            <span>{brand.name}</span>
                                        </label>
                                    ),
                            )}
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

                <section className={isModal ? "space-y-3" : "space-y-3 py-5 first:pt-0"}>
                    <div className={sectionTitleClass}>
                        Цена, BYN
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="number"
                            inputMode="numeric"
                            placeholder="от"
                            value={priceMinDraft}
                            onChange={(e) => setPriceMinDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") applyPrice(); }}
                            suppressHydrationWarning
                            className={siteInput}
                        />
                        <input
                            type="number"
                            inputMode="numeric"
                            placeholder="до"
                            value={priceMaxDraft}
                            onChange={(e) => setPriceMaxDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") applyPrice(); }}
                            suppressHydrationWarning
                            className={siteInput}
                        />
                    </div>
                    {!isModal ? (
                        <button type="button" onClick={applyPrice} className={`${siteBtnPrimary} w-full`}>
                            Применить
                        </button>
                    ) : null}
                </section>

                <section className={isModal ? "space-y-0.5" : "space-y-0.5 py-5 first:pt-0"}>
                    {renderCheckboxOption(
                        "tester",
                        "Тестер",
                        isFlagSelected("tester"),
                        () => toggleFlag("tester"),
                    )}
                    {renderCheckboxOption(
                        "miniature",
                        "Миниатюра",
                        isFlagSelected("miniature"),
                        () => toggleFlag("miniature"),
                    )}
                    {renderCheckboxOption(
                        "set",
                        "Набор",
                        isFlagSelected("set"),
                        () => toggleFlag("set"),
                    )}
                </section>

                {safeVolumeOptions.length > 0 ? (
                    <section className={isModal ? "space-y-3" : "space-y-3 py-5 first:pt-0"}>
                        <div className={sectionTitleClass}>
                            Объём, мл
                        </div>
                        {isModal ? (
                            <div className="space-y-0.5">
                                {safeVolumeOptions.map((item) =>
                                    renderCheckboxOption(
                                        item.key,
                                        item.label,
                                        isVolumeSelected(item.key),
                                        () => toggleVolumeOption(item.key),
                                    ),
                                )}
                            </div>
                        ) : (
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
                        )}
                    </section>
                ) : null}

                {safeAttributes.map((attribute) => (
                    <section key={attribute.id} className={isModal ? "space-y-3" : "space-y-3 py-5 first:pt-0"}>
                        <div className={sectionTitleClass}>
                            {attribute.name}
                        </div>
                        {isModal ? (
                            <div className="space-y-0.5">
                                {attribute.options.map((option) =>
                                    renderCheckboxOption(
                                        `${attribute.id}-${option.id}`,
                                        option.name,
                                        isOptionSelected(attribute.id, option.id),
                                        () => toggleAttributeOption(attribute.id, option.id),
                                    ),
                                )}
                            </div>
                        ) : (
                            <>
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
                            </>
                        )}
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
                                className="rounded-2xl px-2 py-1 text-sm text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                            >
                                Закрыть
                            </button>
                        </div>
                        <input
                            type="text"
                            value={attributeOptionQuery}
                            onChange={(e) => setAttributeOptionQuery(e.target.value)}
                            placeholder="Поиск в фильтре"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-form-type="other"
                            suppressHydrationWarning
                            className={`${siteInput} mb-3`}
                        />
                        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                            {filteredPopupOptions.map((option) => (
                                <label
                                    key={option.id}
                                    className="flex cursor-pointer items-center rounded-2xl border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text transition hover:bg-admin-muted"
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
                                className="rounded-2xl px-2 py-1 text-sm text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                            >
                                Закрыть
                            </button>
                        </div>

                        <input
                            type="text"
                            value={brandQuery}
                            onChange={(e) => setBrandQuery(e.target.value)}
                            placeholder="Поиск бренда"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-form-type="other"
                            suppressHydrationWarning
                            className={`${siteInput} mb-3`}
                        />

                        <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--line)] pb-3">
                            {brandSectionLetters.map((letter) => (
                                <button
                                    key={`anchor-${letter}`}
                                    type="button"
                                    onClick={() => scrollToBrandLetter(letter)}
                                    className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--foreground)] transition hover:bg-[var(--background)]"
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
                                                className="flex cursor-pointer items-center rounded-2xl px-2 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
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
