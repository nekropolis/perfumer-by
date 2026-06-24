"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import ManualPriceReviewsTable from "@/components/admin/pricing/manual-price-reviews-table";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    fetchManualPriceReviews,
    saveManualPriceReview,
    type ManualPriceReviewItem,
} from "@/lib/admin-pricing-api";

export default function AdminManualPriceReviewsPage() {
    const [page, setPage] = useUrlPage();
    const [searchInput, setSearchInput] = useState("");
    const debouncedSearch = useDebouncedValue(searchInput, 400);
    const [items, setItems] = useState<ManualPriceReviewItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [savingId, setSavingId] = useState<number | null>(null);

    useResetPageOnChange(setPage, [debouncedSearch]);

    const loadItems = useCallback(async (targetPage: number, search: string) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetchManualPriceReviews({
                page: targetPage,
                search: search.trim() || undefined,
            });
            setItems(res.data || []);
            setMeta(res);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadItems(page, debouncedSearch);
    }, [loadItems, page, debouncedSearch]);

    const handleSave = async (
        item: ManualPriceReviewItem,
        state: { price: string; listOnStorefront: boolean },
    ) => {
        setSavingId(item.id);
        setError("");
        try {
            await saveManualPriceReview(item.id, {
                manual_retail_price: Number(state.price),
                list_on_storefront: state.listOnStorefront,
            });
            setSuccess("Цена сохранена");
            await loadItems(page, debouncedSearch);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения");
        } finally {
            setSavingId(null);
        }
    };

    return (
        <AdminPageCard>
            <div className="space-y-4 rounded-2xl border bg-white p-6">
                <div>
                    <h1 className="text-lg font-semibold">Ручная установка цен</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">
                        Товары на складе, для которых автоматический пересчёт невозможен. После следующего
                        «Обновить цены», если вход станет меньше прайса поставщика — строка исчезнет и цена
                        пересчитается автоматически.
                    </p>
                    <p className="mt-1 text-sm text-admin-text-secondary">
                        Чекбокс «В наличии» включает вариант на витрине (<code className="text-xs">is_active</code>).
                    </p>
                </div>

                {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
                {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

                <AdminTableShell
                    total={meta?.total ?? items.length}
                    search={
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Поиск по товару или коду"
                        />
                    }
                    footer={
                        meta && meta.last_page > 1 ? (
                            <AdminPagination
                                currentPage={meta.current_page ?? page}
                                lastPage={meta.last_page}
                                onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                                onNextAction={() =>
                                    setPage((p) => (meta.current_page < meta.last_page ? p + 1 : p))
                                }
                            />
                        ) : null
                    }
                >
                    {loading && items.length === 0 ? (
                        <AdminLoadingState />
                    ) : items.length === 0 ? (
                        <AdminEmptyState
                            title="Очередь пуста"
                            description="Нет вариантов для ручной установки. Запустите «Обновить цены» в разделе обновления."
                        />
                    ) : (
                        <ManualPriceReviewsTable
                            items={items}
                            savingId={savingId}
                            onSaveAction={handleSave}
                        />
                    )}
                </AdminTableShell>
            </div>
        </AdminPageCard>
    );
}
