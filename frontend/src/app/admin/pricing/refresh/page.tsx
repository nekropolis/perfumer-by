"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import InStockPricingPreviewTable from "@/components/admin/pricing/in-stock-pricing-preview-table";
import SupplierPriceFilesList from "@/components/admin/pricing/supplier-price-files-list";
import { useAdminPricingShell } from "@/components/admin/pricing/admin-pricing-shell";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    fetchInStockPricingPreview,
    type InStockPricingPreviewRow,
} from "@/lib/admin-pricing-api";

const PER_PAGE_OPTIONS = [25, 50, 100] as const;

const ROLE_OPTIONS = [
    { value: "ordinary", label: "Обычная" },
    { value: "allparfume", label: "Allparfume" },
] as const;

type RoleFilter = "" | "ordinary" | "allparfume";

export default function AdminPricingRefreshPage() {
    const searchParams = useSearchParams();
    const { contentEpoch, priceFiles } = useAdminPricingShell();
    const [page, setPage] = useUrlPage();
    const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(50);
    const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
    const debouncedSearch = useDebouncedValue(searchInput, 350);
    const [previewItems, setPreviewItems] = useState<InStockPricingPreviewRow[]>([]);
    const [previewMeta, setPreviewMeta] = useState<{
        current_page: number;
        last_page: number;
        total: number;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useResetPageOnChange(setPage, [debouncedSearch, perPage, roleFilter]);

    const loadPreview = useCallback(async (targetPage: number) => {
        setLoading(true);
        setError("");
        try {
            const previewRes = await fetchInStockPricingPreview({
                page: targetPage,
                per_page: perPage,
                search: debouncedSearch || undefined,
                role: roleFilter || undefined,
            });
            setPreviewItems(previewRes.data || []);
            setPreviewMeta(previewRes);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, perPage, roleFilter]);

    useEffect(() => {
        void loadPreview(page);
    }, [page, loadPreview, contentEpoch]);

    return (
        <div className="space-y-3">
            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}

            <div className="min-w-0">
                <SupplierPriceFilesList items={priceFiles} />
            </div>

            <div className="space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-admin-text-secondary">
                        Всего:{" "}
                        <span className="font-medium tabular-nums text-admin-text">
                            {previewMeta?.total ?? (loading ? "…" : previewItems.length)}
                        </span>
                    </div>
                    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center md:justify-end">
                        <AdminFilterSelect
                            className="min-w-0 w-full md:w-auto"
                            value={roleFilter}
                            onChangeAction={(value) => setRoleFilter(value as RoleFilter)}
                            options={ROLE_OPTIONS as unknown as Array<{ value: string; label: string }>}
                            placeholder="Все роли"
                        />
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Поиск: id, бренд, название"
                        />
                    </div>
                </div>

                {loading ? (
                    <AdminLoadingState />
                ) : previewItems.length === 0 ? (
                    <AdminEmptyState
                        title="Нет вариантов в наличии"
                        description="Или измените поиск."
                    />
                ) : (
                    <>
                        <InStockPricingPreviewTable
                            items={previewItems}
                            searchQuery={debouncedSearch}
                        />
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                            <label className="flex items-center gap-2 text-sm text-admin-text-secondary">
                                На странице
                                <select
                                    value={perPage}
                                    onChange={(e) => {
                                        const v = Number(e.target.value);
                                        if (v === 25 || v === 50 || v === 100) {
                                            setPerPage(v);
                                        }
                                    }}
                                    className="rounded-lg border border-admin-border bg-admin-surface px-2 py-1.5 text-sm text-admin-text"
                                >
                                    {PER_PAGE_OPTIONS.map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <AdminPagination
                                currentPage={previewMeta?.current_page ?? 1}
                                lastPage={previewMeta?.last_page ?? 1}
                                onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                                onNextAction={() =>
                                    setPage((p) =>
                                        previewMeta && previewMeta.current_page < previewMeta.last_page
                                            ? p + 1
                                            : p,
                                    )
                                }
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
