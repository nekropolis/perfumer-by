"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterX } from "lucide-react";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import ManualPriceReviewsTable, {
    MANUAL_PRICE_REASON_LABELS,
} from "@/components/admin/pricing/manual-price-reviews-table";
import { useAdminPricingShell } from "@/components/admin/pricing/admin-pricing-shell";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    fetchManualPriceReviews,
    saveManualPriceReview,
    type ManualPriceReviewItem,
} from "@/lib/admin-pricing-api";

const PER_PAGE_OPTIONS = [25, 50, 100, 2000] as const;
const PER_PAGE_ALL = 2000;

const REASON_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "", label: "Все причины" },
    { value: "no_supplier_match", label: MANUAL_PRICE_REASON_LABELS.no_supplier_match },
    { value: "warehouse_offer_gap", label: MANUAL_PRICE_REASON_LABELS.warehouse_offer_gap },
    { value: "warehouse_blend_gap", label: MANUAL_PRICE_REASON_LABELS.warehouse_blend_gap },
    { value: "allparfume_no_match", label: MANUAL_PRICE_REASON_LABELS.allparfume_no_match },
    { value: "allparfume_no_input", label: MANUAL_PRICE_REASON_LABELS.allparfume_no_input },
];

export default function AdminManualPriceReviewsPage() {
    const { contentEpoch, bumpContent } = useAdminPricingShell();
    const [page, setPage] = useUrlPage();
    const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(25);
    const [searchInput, setSearchInput] = useState("");
    const debouncedSearch = useDebouncedValue(searchInput, 400);
    const [reason, setReason] = useState("");
    const [items, setItems] = useState<ManualPriceReviewItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [savingId, setSavingId] = useState<number | null>(null);

    useResetPageOnChange(setPage, [debouncedSearch, perPage, reason]);

    const loadItems = useCallback(
        async (targetPage: number, search: string, targetPerPage: number, reasonFilter: string) => {
            setLoading(true);
            setError("");
            try {
                const res = await fetchManualPriceReviews({
                    page: targetPage,
                    per_page: targetPerPage,
                    search: search.trim() || undefined,
                    reason: reasonFilter || undefined,
                });
                setItems(res.data || []);
                setMeta({
                    current_page: res.current_page,
                    last_page: res.last_page,
                    total: res.total,
                });
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки");
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        void loadItems(page, debouncedSearch, perPage, reason);
    }, [loadItems, page, debouncedSearch, perPage, reason, contentEpoch]);

    const hasActiveFilters = useMemo(
        () => searchInput.trim() !== "" || reason !== "",
        [searchInput, reason],
    );

    const handleSave = async (
        item: ManualPriceReviewItem,
        state: {
            warehousePurchase: string;
            formulaInput: string;
            price: string;
            listOnStorefront: boolean;
        },
    ) => {
        setSavingId(item.id);
        setError("");
        try {
            await saveManualPriceReview(item.id, {
                manual_retail_price: Number(state.price),
                formula_input:
                    state.formulaInput.trim() !== "" && Number.isFinite(Number(state.formulaInput))
                        ? Number(state.formulaInput)
                        : undefined,
                list_on_storefront: state.listOnStorefront,
            });
            setSuccess("Цена сохранена");
            bumpContent();
            await loadItems(page, debouncedSearch, perPage, reason);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения");
        } finally {
            setSavingId(null);
        }
    };

    const handleSaveWarehousePurchase = async (
        item: ManualPriceReviewItem,
        warehousePurchase: string,
    ): Promise<boolean> => {
        setSavingId(item.id);
        setError("");
        try {
            const res = await saveManualPriceReview(item.id, {
                warehouse_purchase: Number(warehousePurchase),
            });
            setItems((prev) =>
                prev.map((row) => (row.id === item.id ? { ...row, ...res.data } : row)),
            );
            setSuccess("Входная цена сохранена");
            return true;
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения входной цены");
            return false;
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <p className="text-sm text-admin-text-secondary">
                    Товары на складе, для которых автоматический пересчёт невозможен. После следующего
                    «Обновить цены», если вход станет меньше прайса поставщика — строка исчезнет и цена
                    пересчитается автоматически.
                </p>
            </div>

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
                        <AdminStatusDropdown
                            value={reason}
                            options={REASON_FILTER_OPTIONS}
                            onChangeAction={setReason}
                            widthClassName="w-full max-w-full shrink-0 sm:w-56"
                            menuWidthClassName="w-max min-w-[14rem]"
                        />
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Поиск по товару или коду"
                            className="min-w-0 w-full max-w-full sm:w-72"
                        />
                        {hasActiveFilters ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchInput("");
                                    setReason("");
                                }}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-admin-border bg-white text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                                title="Сбросить фильтры"
                                aria-label="Сбросить фильтры"
                            >
                                <FilterX size={16} strokeWidth={2} />
                            </button>
                        ) : null}
                    </div>
                }
                footer={
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <label className="flex items-center gap-2 text-sm text-admin-text-secondary">
                            На странице
                            <select
                                value={perPage}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    if (v === 25 || v === 50 || v === 100 || v === PER_PAGE_ALL) {
                                        setPerPage(v);
                                    }
                                }}
                                className="cursor-pointer rounded-lg border border-admin-border bg-white px-2 py-1.5 text-sm"
                            >
                                {PER_PAGE_OPTIONS.map((n) => (
                                    <option key={n} value={n}>
                                        {n === PER_PAGE_ALL ? "Все" : n}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <AdminPagination
                            currentPage={meta?.current_page ?? page}
                            lastPage={meta?.last_page ?? 1}
                            onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                            onNextAction={() =>
                                setPage((p) =>
                                    meta && meta.current_page < meta.last_page ? p + 1 : p,
                                )
                            }
                        />
                    </div>
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
                        onSaveWarehousePurchaseAction={handleSaveWarehousePurchase}
                    />
                )}
            </AdminTableShell>
        </div>
    );
}
