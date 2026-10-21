"use client";

import { useEffect, useRef, useState } from "react";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import useDebouncedValue from "@/hooks/use-debounced-value";
import {
    flattenProductSmartSearchHits,
    productSmartSearchAvailabilityClass,
    productSmartSearchAvailabilityLabel,
    productSmartSearchPriceLabel,
    productSmartSearchShowsPrice,
    smartSearchProductsWithFallback,
    type ProductSmartSearchItem,
    type ProductSmartSearchVariantPreview,
} from "@/lib/admin-products-api";
import { updateProductVariant, type AdminProductVariantItem } from "@/lib/admin-product-variants-api";

type Props = {
    open: boolean;
    productId: number;
    variant: AdminProductVariantItem | null;
    onCloseAction: () => void;
    onSavedAction: (next: AdminProductVariantItem) => void;
    onErrorAction: (message: string) => void;
};

export default function VariantReplacementPickerModal({
    open,
    productId,
    variant,
    onCloseAction,
    onSavedAction,
    onErrorAction,
}: Props) {
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<ProductSmartSearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const debouncedQuery = useDebouncedValue(query, 250);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setHits([]);
            setLoading(false);
            setSaving(false);
            return;
        }
        const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
        return () => window.clearTimeout(timer);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const q = debouncedQuery.trim();
        if (q.length < 2) {
            setHits([]);
            setLoading(false);
            return;
        }

        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const response = await smartSearchProductsWithFallback({ q, limit: 10 });
                if (!cancelled) {
                    setHits(response.data ?? []);
                }
            } catch {
                if (!cancelled) {
                    setHits([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [open, debouncedQuery]);

    const saveReplacement = async (
        replacementVariantId: number | null,
        summary?: AdminProductVariantItem["replacement"],
    ) => {
        if (!variant) {
            return;
        }
        setSaving(true);
        try {
            const result = await updateProductVariant(productId, variant.id, {
                is_discontinued: true,
                replacement_variant_id: replacementVariantId,
            });
            onSavedAction({
                ...variant,
                ...result.data,
                is_discontinued: true,
                replacement_variant_id: replacementVariantId,
                replacement: replacementVariantId == null ? null : (summary ?? null),
            });
            onCloseAction();
        } catch (e: unknown) {
            onErrorAction(e instanceof Error ? e.message : "Не удалось сохранить замену");
        } finally {
            setSaving(false);
        }
    };

    const selectHit = async (
        hit: ProductSmartSearchItem,
        variantPreview: ProductSmartSearchVariantPreview,
    ) => {
        if (variantPreview.id == null) {
            onErrorAction("У выбранной строки нет id варианта");
            return;
        }
        if (variantPreview.id === variant?.id) {
            onErrorAction("Нельзя выбрать тот же вариант как замену");
            return;
        }
        await saveReplacement(variantPreview.id, {
            variant_id: variantPreview.id,
            product_id: hit.id,
            product_name: hit.name,
            brand_name: hit.brand_name,
            variant_title: variantPreview.title,
        });
    };

    const currentLabel = variant?.replacement
        ? [
              variant.replacement.brand_name,
              variant.replacement.product_name,
              variant.replacement.variant_title,
          ]
              .filter(Boolean)
              .join(" · ")
        : null;

    return (
        <AdminModalShell
            open={open}
            onCloseAction={onCloseAction}
            title="Замена снятого с производства"
            maxWidthClass="sm:max-w-xl"
            footer={
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                        type="button"
                        disabled={saving || !variant?.replacement_variant_id}
                        onClick={() => void saveReplacement(null)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
                    >
                        Сбросить замену
                    </button>
                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="rounded-lg border px-3 py-1.5 text-sm"
                    >
                        Закрыть
                    </button>
                </div>
            }
        >
            <div className="space-y-3">
                {currentLabel ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                        Сейчас: {currentLabel}
                    </div>
                ) : (
                    <div className="rounded-lg border border-admin-border bg-admin-muted/40 px-3 py-2 text-sm text-admin-text-secondary">
                        Замена ещё не выбрана. Найдите товар и вариант — как в заказе.
                    </div>
                )}

                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Поиск товара с вариантом</label>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Название, бренд…"
                        disabled={saving}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                </div>

                <div className="max-h-64 overflow-y-auto rounded-xl border bg-white p-1">
                    {loading ? (
                        <div className="px-2 py-3 text-xs text-admin-text-secondary">Поиск…</div>
                    ) : debouncedQuery.trim().length < 2 ? (
                        <div className="px-2 py-3 text-xs text-admin-text-secondary">
                            Введите минимум 2 символа
                        </div>
                    ) : flattenProductSmartSearchHits(hits).length === 0 ? (
                        <div className="px-2 py-3 text-xs text-admin-text-secondary">Ничего не найдено</div>
                    ) : (
                        flattenProductSmartSearchHits(hits).map((option) => {
                            if (option.kind === "no-variants") {
                                return (
                                    <div
                                        key={option.key}
                                        className="rounded-lg px-2 py-2 text-left text-xs text-admin-text-secondary"
                                    >
                                        {option.hit.id}{" "}
                                        {option.hit.brand_name ? `${option.hit.brand_name} ` : ""}
                                        {option.hit.name} — нет вариантов
                                    </div>
                                );
                            }
                            const { hit, variant: preview } = option;
                            const selected = preview.id != null && preview.id === variant?.replacement_variant_id;
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    disabled={saving || preview.id === variant?.id}
                                    onClick={() => void selectHit(hit, preview)}
                                    className={`block w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-admin-muted disabled:opacity-50 ${
                                        selected ? "bg-emerald-50" : ""
                                    }`}
                                >
                                    <span className="tabular-nums text-gray-400">{hit.id}</span>{" "}
                                    {hit.brand_name ? (
                                        <span className="text-admin-text-secondary">{hit.brand_name} </span>
                                    ) : null}
                                    <span className="font-medium text-admin-text">{hit.name}</span>{" "}
                                    <span className="text-admin-text">{preview.title}</span>
                                    <span className="text-admin-text-secondary"> — </span>
                                    <span className={productSmartSearchAvailabilityClass(preview)}>
                                        {productSmartSearchAvailabilityLabel(preview)}
                                    </span>
                                    {productSmartSearchShowsPrice(preview) ? (
                                        <>
                                            <span className="text-admin-text-secondary"> — </span>
                                            <span className="tabular-nums">
                                                {productSmartSearchPriceLabel(preview)}
                                            </span>
                                        </>
                                    ) : null}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </AdminModalShell>
    );
}
