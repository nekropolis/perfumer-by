"use client";

import { useEffect, useRef, useState } from "react";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import useDebouncedValue from "@/hooks/use-debounced-value";
import {
    fetchProductLinkSearch,
    updateProductReplacement,
    type ProductAdminItem,
    type ProductReplacementSummary,
} from "@/lib/admin-products-api";

type Props = {
    open: boolean;
    productId: number;
    excludeProductId: number;
    onCloseAction: () => void;
    onSavedAction: (replacement: ProductReplacementSummary) => void;
    onErrorAction: (message: string) => void;
};

export default function ProductReplacementPickerModal({
    open,
    productId,
    excludeProductId,
    onCloseAction,
    onSavedAction,
    onErrorAction,
}: Props) {
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<ProductAdminItem[]>([]);
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
                const response = await fetchProductLinkSearch({ q, limit: 12, in_stock: true });
                if (!cancelled) {
                    setHits((response.data ?? []).filter((item) => item.id !== excludeProductId));
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
    }, [open, debouncedQuery, excludeProductId]);

    const selectProduct = async (item: ProductAdminItem) => {
        setSaving(true);
        try {
            const result = await updateProductReplacement(productId, item.id);
            const replacement = result.data.replacement ?? {
                product_id: item.id,
                product_name: item.name,
                product_slug: item.slug,
                brand_name: item.brand?.name ?? null,
                display_name: [item.brand?.name, item.name].filter(Boolean).join(" "),
                image: null,
            };
            onSavedAction(replacement);
            onCloseAction();
        } catch (e: unknown) {
            onErrorAction(e instanceof Error ? e.message : "Не удалось привязать продукт");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminModalShell
            open={open}
            onCloseAction={onCloseAction}
            title="Дополнительный продукт"
            maxWidthClass="sm:max-w-xl"
            footer={
                <div className="flex justify-end">
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
                <p className="text-sm text-admin-text-secondary">
                    Поиск товара без выбора варианта. Можно привязать только один продукт.
                </p>
                <div>
                    <label className="mb-1 block text-sm text-admin-text-secondary">Поиск продукта</label>
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
                    ) : hits.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-admin-text-secondary">Ничего не найдено</div>
                    ) : (
                        hits.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                disabled={saving}
                                onClick={() => void selectProduct(item)}
                                className="block w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-admin-muted disabled:opacity-50"
                            >
                                <span className="tabular-nums text-gray-400">{item.id}</span>{" "}
                                {item.brand?.name ? (
                                    <span className="text-admin-text-secondary">{item.brand.name} </span>
                                ) : null}
                                <span className="font-medium text-admin-text">{item.name}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </AdminModalShell>
    );
}
