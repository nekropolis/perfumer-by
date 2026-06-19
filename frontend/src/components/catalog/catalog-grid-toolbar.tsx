"use client";

import { ChevronDown, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";
import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";
import { siteBtnSecondary, siteFilterChip, siteFilterChipActive, siteFilterChipInactive } from "@/lib/site-ui-classes";

type Props = {
    basePath: string;
    brands: CatalogBrandItem[];
    attributes: CatalogFilterAttribute[];
    mobileRightAction?: ReactNode;
};

type SortOption = {
    value: string;
    label: string;
};

const SORT_OPTIONS: SortOption[] = [
    { value: "price_asc", label: "Сначала дешевле" },
    { value: "price_desc", label: "Сначала дороже" },
    { value: "name_asc", label: "По названию (А-Я)" },
    { value: "name_desc", label: "По названию (Я-А)" },
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

type PinMetrics = {
    top: number;
    left: number;
    width: number;
    height: number;
};

export default function CatalogGridToolbar({ basePath, brands, attributes, mobileRightAction }: Props) {
    const { navigate } = useCatalogNavigation();
    const searchParams = useSearchParams();
    const currentSort = searchParams.get("sort") || "price_asc";
    const safeAttributes = useMemo(() => (Array.isArray(attributes) ? attributes : []), [attributes]);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const toolbarRef = useRef<HTMLDivElement | null>(null);
    const [pinMetrics, setPinMetrics] = useState<PinMetrics | null>(null);

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
        () => Array.from(searchParams.keys()).some((key) => key !== "page" && key !== "sort"),
        [searchParams]
    );

    const currentSortLabel = SORT_OPTIONS.find((item) => item.value === currentSort)?.label ?? SORT_OPTIONS[0].label;
    const hasChips = activeChips.length > 0;

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 1280px)");

        const readStickyTop = () => {
            const raw = getComputedStyle(document.documentElement).getPropertyValue("--catalog-toolbar-sticky-top");
            const parsed = Number.parseFloat(raw);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 79;
        };

        const update = () => {
            if (mq.matches) {
                setPinMetrics(null);
                return;
            }

            const sentinel = sentinelRef.current;
            const toolbar = toolbarRef.current;
            if (!sentinel || !toolbar) {
                return;
            }

            const stickyTop = readStickyTop();
            if (sentinel.getBoundingClientRect().top > stickyTop) {
                setPinMetrics(null);
                return;
            }

            const anchor = toolbar.closest("section") ?? toolbar.parentElement ?? toolbar;
            const box = anchor.getBoundingClientRect();

            setPinMetrics((prev) => {
                const next: PinMetrics = {
                    top: stickyTop,
                    left: box.left,
                    width: box.width,
                    height: toolbar.offsetHeight,
                };

                if (
                    prev &&
                    prev.top === next.top &&
                    prev.left === next.left &&
                    prev.width === next.width &&
                    prev.height === next.height
                ) {
                    return prev;
                }

                return next;
            });
        };

        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        mq.addEventListener("change", update);

        const toolbar = toolbarRef.current;
        const ro = toolbar ? new ResizeObserver(update) : null;
        if (toolbar && ro) {
            ro.observe(toolbar);
        }

        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            mq.removeEventListener("change", update);
            ro?.disconnect();
        };
    }, []);

    return (
        <>
            <div ref={sentinelRef} className="pointer-events-none h-0 w-full xl:hidden" aria-hidden />
            {pinMetrics ? (
                <div className="xl:hidden" style={{ height: pinMetrics.height }} aria-hidden />
            ) : null}
            <div
                ref={toolbarRef}
                className={`mb-4 bg-admin-bg pb-2 xl:static xl:z-auto xl:bg-transparent xl:pb-0 ${
                    pinMetrics ? "fixed z-[110] xl:static" : "relative z-auto"
                }`}
                style={
                    pinMetrics
                        ? {
                              top: pinMetrics.top,
                              left: pinMetrics.left,
                              width: pinMetrics.width,
                          }
                        : undefined
                }
            >
                <div className="-mx-2 rounded-xl border border-admin-border bg-admin-surface px-2 py-2 shadow-sm xl:mx-0 xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none">
                    <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:justify-between">
                        <div className="relative min-w-0 md:w-fit" ref={sortMenuRef}>
                            <button
                                type="button"
                                onClick={() => setIsSortOpen((prev) => !prev)}
                                className={`${siteBtnSecondary} h-11 w-full justify-between px-3 text-left md:w-auto md:min-w-[220px]`}
                                aria-haspopup="listbox"
                                aria-expanded={isSortOpen}
                                aria-label="Сортировка"
                            >
                                <span className="truncate">{currentSortLabel}</span>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-admin-text-secondary transition ${isSortOpen ? "rotate-180" : ""}`} />
                            </button>

                            {isSortOpen ? (
                                <div className="absolute left-0 top-[calc(100%+0.4rem)] z-40 w-full rounded-xl border border-admin-border bg-admin-surface p-1 shadow-xl md:min-w-[280px] md:w-max">
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
                                                    isActive ? "bg-admin-muted text-admin-text" : "text-admin-text hover:bg-admin-muted/70"
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

                        <div className="min-w-0 lg:hidden">{mobileRightAction}</div>
                    </div>

                    <div className="mt-2 flex items-center justify-end gap-2">
                        {hasActiveFilters ? (
                            <button
                                type="button"
                                onClick={() => navigate(basePath)}
                                className="text-xs font-medium text-admin-text-secondary transition hover:text-admin-text"
                            >
                                Сбросить фильтры
                            </button>
                        ) : null}
                    </div>
                </div>

                {hasChips ? (
                    <div className="mt-3 flex flex-wrap gap-2 max-xl:px-2">
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
                ) : null}
            </div>
        </>
    );
}
