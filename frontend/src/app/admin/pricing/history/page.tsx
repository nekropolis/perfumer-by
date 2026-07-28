"use client";

import { useCallback, useEffect, useState } from "react";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import PriceRefreshRunsTable from "@/components/admin/pricing/price-refresh-runs-table";
import { useAdminPricingShell } from "@/components/admin/pricing/admin-pricing-shell";
import useUrlPage from "@/hooks/use-url-page";
import { fetchPriceRefreshRuns, type PriceRefreshRunItem } from "@/lib/admin-pricing-api";

export default function AdminPricingHistoryPage() {
    const { contentEpoch } = useAdminPricingShell();
    const [page, setPage] = useUrlPage();
    const [runs, setRuns] = useState<PriceRefreshRunItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadData = useCallback(async (targetPage: number) => {
        setLoading(true);
        setError("");
        try {
            const runsRes = await fetchPriceRefreshRuns(targetPage);
            setRuns(runsRes.data || []);
            setMeta(runsRes);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData(page);
    }, [page, loadData, contentEpoch]);

    return (
        <div className="space-y-4">
            <p className="text-sm text-admin-text-secondary">
                Журнал запусков обновления цен.
            </p>

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}

            {loading ? (
                <AdminLoadingState />
            ) : runs.length === 0 ? (
                <AdminEmptyState
                    title="Запусков пока нет"
                    description="Загрузите прайс и нажмите «Обновить цены»."
                />
            ) : (
                <AdminTableShell total={meta?.total ?? runs.length}>
                    <PriceRefreshRunsTable items={runs} />
                </AdminTableShell>
            )}

            {meta && meta.last_page > 1 ? (
                <AdminPagination
                    currentPage={meta.current_page ?? page}
                    lastPage={meta.last_page}
                    onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                    onNextAction={() =>
                        setPage((p) => (meta.current_page < meta.last_page ? p + 1 : p))
                    }
                />
            ) : null}
        </div>
    );
}
