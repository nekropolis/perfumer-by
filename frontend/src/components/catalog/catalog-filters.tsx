"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CatalogBrandItem, CatalogFilterAttribute } from "@/types/catalog";

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
    const brandGroups = useMemo(() => {
        const sorted = [...filteredBrands].sort((a, b) => a.name.localeCompare(b.name, "ru"));
        const groups = new Map<string, CatalogBrandItem[]>();
        for (const brand of sorted) {
            const first = brand.name.trim().charAt(0).toUpperCase() || "#";
            const letter = /[A-ZА-ЯЁ]/.test(first) ? first : "#";
            const bucket = groups.get(letter) ?? [];
            bucket.push(brand);
            groups.set(letter, bucket);
        }
        return groups;
    }, [filteredBrands]);
    const brandLetters = useMemo(() => Array.from(brandGroups.keys()), [brandGroups]);

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
                        className="text-xs font-medium text-gray-500 transition hover:text-black"
                    >
                        Очистить всё
                    </button>
                ) : null}
            </div>

            {showBrandFilter ? (
                <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Бренд
                    </div>
                    <div className="space-y-1">
                        {previewBrands.map((brand) => (
                            <label
                                key={`brand-preview-${brand.id}`}
                                className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={isBrandSelected(brand.id)}
                                        onChange={() => toggleBrand(brand.id)}
                                        className="h-4 w-4 rounded border-gray-300"
                                    />
                                    {brand.name}
                                </span>
                            </label>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsBrandModalOpen(true)}
                        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                    >
                        <span>Все {brands.length} варианта</span>
                        <span>›</span>
                    </button>
                </div>
            ) : null}

            <div className="space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Цена
                </div>
                {priceRange.min !== null && priceRange.max !== null ? (
                    <div className="text-xs text-gray-500">
                        Диапазон: {formatPrice(priceRange.min)} - {formatPrice(priceRange.max)} BYN
                    </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="number"
                        placeholder="От"
                        value={priceMinDraft}
                        onChange={(e) => setPriceMinDraft(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                    <input
                        type="number"
                        placeholder="До"
                        value={priceMaxDraft}
                        onChange={(e) => setPriceMaxDraft(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    />
                </div>
                <button
                    type="button"
                    onClick={applyPrice}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-100"
                >
                    Применить цену
                </button>
            </div>

            <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Объем
                </div>
                <div className="space-y-1">
                    {safeVolumeOptions.map((item) => (
                        <label
                            key={item.key}
                            className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 transition hover:bg-gray-50"
                        >
                            <span className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={isVolumeSelected(item.key)}
                                    onChange={() => toggleVolumeOption(item.key)}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                {item.label}
                            </span>
                            <span className="text-xs text-gray-500">{item.products_count}</span>
                        </label>
                    ))}
                </div>
            </div>

            {safeAttributes.map((attribute) => (
                <div key={attribute.id} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {attribute.name}
                    </div>
                    <div className="space-y-1">
                        {attribute.options.slice(0, 4).map((option) => (
                            <label
                                key={option.id}
                                className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 transition hover:bg-gray-50"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={isOptionSelected(attribute.id, option.id)}
                                        onChange={() => toggleAttributeOption(attribute.id, option.id)}
                                        className="h-4 w-4 rounded border-gray-300"
                                    />
                                    {option.name}
                                </span>
                                <span className="text-xs text-gray-500">{option.products_count}</span>
                            </label>
                        ))}
                        {attribute.options.length > 4 ? (
                            <button
                                type="button"
                                onClick={() => setPopupAttributeId(attribute.id)}
                                className="w-full rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                                Показать все ({attribute.options.length})
                            </button>
                        ) : null}
                    </div>
                </div>
            ))}

            {popupAttribute ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-900">{popupAttribute.name}</div>
                            <button
                                type="button"
                                onClick={() => setPopupAttributeId(null)}
                                className="rounded-lg px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-black"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
                            {popupAttribute.options.map((option) => (
                                <label
                                    key={option.id}
                                    className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 transition hover:bg-gray-50"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={isOptionSelected(popupAttribute.id, option.id)}
                                            onChange={() => toggleAttributeOption(popupAttribute.id, option.id)}
                                            className="h-4 w-4 rounded border-gray-300"
                                        />
                                        {option.name}
                                    </span>
                                    <span className="text-xs text-gray-500">{option.products_count}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            {isBrandModalOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={() => setIsBrandModalOpen(false)}
                >
                    <div
                        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-900">Бренд</div>
                            <button
                                type="button"
                                onClick={() => setIsBrandModalOpen(false)}
                                className="rounded-lg px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-black"
                            >
                                Закрыть
                            </button>
                        </div>

                        <input
                            type="text"
                            value={brandQuery}
                            onChange={(e) => setBrandQuery(e.target.value)}
                            placeholder="Поиск"
                            className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        />

                        <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-100 pb-3">
                            {brandLetters.map((letter) => (
                                <button
                                    key={`anchor-${letter}`}
                                    type="button"
                                    onClick={() => scrollToBrandLetter(letter)}
                                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50"
                                >
                                    {letter}
                                </button>
                            ))}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {brandLetters.map((letter) => (
                                    <div key={`group-${letter}`} id={`brand-letter-${letter}`} className="space-y-1">
                                        <div className="sticky top-0 z-10 bg-white py-1 text-xs font-semibold text-gray-500">
                                            {letter}
                                        </div>
                                        {(brandGroups.get(letter) ?? []).map((brand) => (
                                            <label
                                                key={`brand-modal-${brand.id}`}
                                                className="flex cursor-pointer items-center rounded-lg px-2 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50"
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={isBrandSelected(brand.id)}
                                                        onChange={() => toggleBrand(brand.id)}
                                                        className="h-4 w-4 rounded border-gray-300"
                                                    />
                                                    {brand.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
