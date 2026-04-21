"use client";

import { ChevronDown, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";

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

export default function CatalogGridToolbar({ basePath, brands, attributes, mobileRightAction }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentSort = searchParams.get("sort") || "price_asc";
    const safeAttributes = useMemo(() => (Array.isArray(attributes) ? attributes : []), [attributes]);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement | null>(null);

    const pushParams = useCallback((mutator: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams.toString());
        mutator(params);
        params.delete("page");
        router.push(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    }, [basePath, router, searchParams]);

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

    return (
        <div className="mb-4 space-y-3">
            <div className="-mx-2 rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-sm lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:justify-between">
                    <div className="relative min-w-0 md:w-fit" ref={sortMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsSortOpen((prev) => !prev)}
                            className="flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 text-left text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 md:w-auto md:min-w-[220px]"
                            aria-haspopup="listbox"
                            aria-expanded={isSortOpen}
                            aria-label="Сортировка"
                        >
                            <span className="truncate">{currentSortLabel}</span>
                            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition ${isSortOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isSortOpen ? (
                            <div className="absolute left-0 top-[calc(100%+0.4rem)] z-40 w-full rounded-xl border border-gray-200 bg-white p-1 shadow-xl md:min-w-[280px] md:w-max">
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
                                                isActive ? "bg-gray-100 text-black" : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                        >
                                            <span>{item.label}</span>
                                            {isActive ? <Check className="h-4 w-4 text-gray-700" /> : null}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    <div className="min-w-0 md:hidden">{mobileRightAction}</div>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                    {hasActiveFilters ? (
                        <button
                            type="button"
                            onClick={() => router.push(basePath)}
                            className="text-xs font-medium text-gray-500 transition hover:text-black"
                        >
                            Сбросить фильтры
                        </button>
                    ) : null}
                </div>
            </div>

            {activeChips.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {activeChips.map((chip) => (
                        <button
                            key={chip.id}
                            type="button"
                            onClick={chip.removeAction}
                            className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                            title="Убрать фильтр"
                        >
                            {chip.label} ×
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
