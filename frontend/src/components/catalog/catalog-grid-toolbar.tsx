"use client";

import { ChevronDown, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCatalogSearchParams } from "@/components/catalog/catalog-search-params";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";
import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";
import {
    siteFilterChip,
    siteFilterChipActive,
    siteFilterChipInactive,
} from "@/lib/site-ui-classes";
import {
    buildCatalogFacetedFiltersResetPath,
    buildCatalogSectionChipPath,
    getActiveCatalogSectionChip,
    hasCatalogFacetedFilters,
    type CatalogSectionChip,
} from "@/lib/catalog-listing-query";

type Props = {
    basePath: string;
    brands: CatalogBrandItem[];
    attributes: CatalogFilterAttribute[];
    showCategoryChips?: boolean;
    showResetFilters?: boolean;
    mobileRightAction?: ReactNode;
};

type SortOption = {
    value: string;
    label: string;
    menuLabel: string;
};

const SORT_OPTIONS: SortOption[] = [
    { value: "popular", label: "Популярные", menuLabel: "По популярности" },
    { value: "price_asc", label: "Сначала дешевле", menuLabel: "Сначала дешевле" },
    { value: "price_desc", label: "Сначала дороже", menuLabel: "Сначала дороже" },
    { value: "name_asc", label: "По названию (А-Я)", menuLabel: "По названию (А-Я)" },
    { value: "name_desc", label: "По названию (Я-А)", menuLabel: "По названию (Я-А)" },
];

const CATEGORY_CHIPS: ReadonlyArray<{ id: CatalogSectionChip; label: string }> = [
    { id: "all", label: "Все" },
    { id: "female", label: "Женские" },
    { id: "male", label: "Мужские" },
    { id: "unisex", label: "Унисекс" },
    { id: "sale", label: "Акции" },
    { id: "new", label: "Новинки" },
    { id: "hit", label: "Хиты" },
];

const VOLUME_LABELS: Record<string, string> = {
    "1-3": "1-3",
    "4-9": "4-9",
    "10-25": "10-25",
    "25-50": "25-50",
    "50-100": "50-100",
    "100-200": "100-200",
    "200-plus": "200+",
};

type ActiveChip = {
    id: string;
    label: string;
    removeAction: () => void;
};

export default function CatalogGridToolbar({
    basePath,
    brands,
    attributes,
    showCategoryChips = false,
    showResetFilters = true,
    mobileRightAction,
}: Props) {
    const { navigate } = useCatalogNavigation();
    const searchParams = useCatalogSearchParams();
    const currentSort = searchParams.get("sort") || "popular";
    const activeSectionChip = getActiveCatalogSectionChip(searchParams);
    const safeAttributes = useMemo(() => (Array.isArray(attributes) ? attributes : []), [attributes]);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement | null>(null);

    const pushParams = useCallback((mutator: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams.toString());
        mutator(params);
        params.delete("page");
        navigate(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`);
    }, [basePath, navigate, searchParams]);

    useEffect(() => {
        if (!isSortOpen) {
            return;
        }
        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            if (!sortMenuRef.current?.contains(event.target as Node)) {
                setIsSortOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsSortOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown, { passive: true });
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [isSortOpen]);

    const activeChips = useMemo<ActiveChip[]>(() => {
        const chips: ActiveChip[] = [];

        const brandIds = (searchParams.get("brand") || "")
            .split(",")
            .map((v) => Number(v))
            .filter((v) => Number.isInteger(v) && v > 0);
        for (const brandId of brandIds) {
            const brand = brands.find((item) => item.id === brandId);
            chips.push({
                id: `brand:${brandId}`,
                label: `Бренд: ${brand?.name ?? String(brandId)}`,
                removeAction: () => {
                    pushParams((params) => {
                        const next = (params.get("brand") || "")
                            .split(",")
                            .map((v) => Number(v))
                            .filter((v) => Number.isInteger(v) && v > 0 && v !== brandId);
                        if (next.length === 0) {
                            params.delete("brand");
                        } else {
                            params.set("brand", next.join(","));
                        }
                    });
                },
            });
        }

        const priceMin = searchParams.get("price_min");
        const priceMax = searchParams.get("price_max");
        if (priceMin || priceMax) {
            chips.push({
                id: "price",
                label: `Цена: ${priceMin || "0"} - ${priceMax || "..."}`,
                removeAction: () => {
                    pushParams((params) => {
                        params.delete("price_min");
                        params.delete("price_max");
                    });
                },
            });
        }

        const selectedVolume = (searchParams.get("volume") || "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        for (const volumeKey of selectedVolume) {
            chips.push({
                id: `volume:${volumeKey}`,
                label: `Объем: ${VOLUME_LABELS[volumeKey] ?? volumeKey}`,
                removeAction: () => {
                    pushParams((params) => {
                        const next = (params.get("volume") || "")
                            .split(",")
                            .map((v) => v.trim())
                            .filter((v) => v && v !== volumeKey);
                        if (next.length === 0) {
                            params.delete("volume");
                        } else {
                            params.set("volume", next.join(","));
                        }
                    });
                },
            });
        }

        for (const [key, value] of searchParams.entries()) {
            if (!key.startsWith("attr_") || !value) {
                continue;
            }
            const attributeId = Number(key.replace("attr_", ""));
            const attribute = safeAttributes.find((item) => item.id === attributeId);
            if (!attribute) {
                continue;
            }

            const optionIds = value
                .split(",")
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0);

            for (const optionId of optionIds) {
                const option = attribute.options.find((item) => item.id === optionId);
                if (!option) {
                    continue;
                }

                chips.push({
                    id: `${key}:${optionId}`,
                    label: `${attribute.name}: ${option.name}`,
                    removeAction: () => {
                        pushParams((params) => {
                            const selected = (params.get(key) || "")
                                .split(",")
                                .map((id) => Number(id))
                                .filter((id) => Number.isInteger(id) && id > 0 && id !== optionId);

                            if (selected.length === 0) {
                                params.delete(key);
                            } else {
                                params.set(key, selected.join(","));
                            }
                        });
                    },
                });
            }
        }

        return chips;
    }, [searchParams, brands, safeAttributes, pushParams]);

    const hasActiveFilters = useMemo(
        () => hasCatalogFacetedFilters(searchParams),
        [searchParams],
    );

    const currentSortOption = SORT_OPTIONS.find((item) => item.value === currentSort) ?? SORT_OPTIONS[0];
    const hasChips = activeChips.length > 0;

    const sortControl = (
        <div className="relative shrink-0" ref={sortMenuRef}>
            <button
                type="button"
                onClick={() => setIsSortOpen((prev) => !prev)}
                className={`${siteFilterChip} ${siteFilterChipInactive} h-10 shrink-0 gap-1.5 rounded-full px-3 text-sm sm:gap-2 sm:px-4`}
                aria-haspopup="listbox"
                aria-expanded={isSortOpen}
                aria-label="Сортировка"
            >
                <span className="whitespace-nowrap">{currentSortOption.menuLabel}</span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-admin-text-secondary transition ${isSortOpen ? "rotate-180" : ""}`}
                />
            </button>

            {isSortOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.4rem)] z-40 min-w-[240px] rounded-xl border border-admin-border bg-admin-surface p-1 shadow-xl">
                    {SORT_OPTIONS.map((item) => {
                        const isActive = item.value === currentSort;
                        return (
                            <button
                                key={item.value}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => {
                                    setIsSortOpen(false);
                                    pushParams((params) => {
                                        params.set("sort", item.value);
                                    });
                                }}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                                    isActive
                                        ? "bg-admin-muted text-admin-text"
                                        : "text-admin-text hover:bg-admin-muted/70"
                                }`}
                            >
                                <span>{item.label}</span>
                                {isActive ? <Check className="h-4 w-4 text-admin-primary" /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );

    const categoryChips = showCategoryChips ? (
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2 [&::-webkit-scrollbar]:hidden">
            {CATEGORY_CHIPS.map((chip) => {
                const isActive = activeSectionChip === chip.id;
                return (
                    <button
                        key={chip.id}
                        type="button"
                        onClick={() => navigate(buildCatalogSectionChipPath(basePath, searchParams, chip.id))}
                        className={`${siteFilterChip} shrink-0 rounded-full px-3 py-1.5 text-sm sm:px-4 ${
                            isActive ? siteFilterChipActive : siteFilterChipInactive
                        }`}
                    >
                        {chip.label}
                    </button>
                );
            })}
        </div>
    ) : null;

    return (
        <div
            className="sticky z-[110] border-b border-admin-border bg-[var(--background)]"
            style={{ top: "var(--catalog-toolbar-sticky-top)" }}
        >
            <div className="flex flex-col gap-2 py-2 sm:gap-3 sm:py-4">
                {showCategoryChips ? (
                    <>
                        <div className="min-w-0 lg:hidden">{categoryChips}</div>
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="shrink-0 lg:hidden">{mobileRightAction}</div>
                            <div className="hidden min-w-0 flex-1 lg:block">{categoryChips}</div>
                            <div className="ml-auto shrink-0">{sortControl}</div>
                        </div>
                    </>
                ) : (
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0 flex-1 lg:hidden">{mobileRightAction}</div>
                        <div className="hidden flex-1 lg:block" />
                        {sortControl}
                    </div>
                )}

                {hasChips || (showResetFilters && hasActiveFilters) ? (
                    <div className="flex min-w-0 items-center gap-3">
                        {hasChips ? (
                            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                                {activeChips.map((chip) => (
                                    <button
                                        key={chip.id}
                                        type="button"
                                        onClick={chip.removeAction}
                                        className={`${siteFilterChip} ${siteFilterChipInactive} text-xs`}
                                        title="Убрать фильтр"
                                    >
                                        {chip.label} ×
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="min-w-0 flex-1" />
                        )}

                        {showResetFilters && hasActiveFilters ? (
                            <button
                                type="button"
                                onClick={() => navigate(buildCatalogFacetedFiltersResetPath(basePath, searchParams))}
                                className="shrink-0 text-xs font-medium text-admin-text-secondary transition hover:text-admin-text"
                            >
                                Сбросить фильтры
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
