"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import PriceRefreshRunsTable from "@/components/admin/pricing/price-refresh-runs-table";
import SupplierPriceFilesList from "@/components/admin/pricing/supplier-price-files-list";
import SupplierPriceUploadModal from "@/components/admin/pricing/supplier-price-upload-modal";
import PriceRefreshRunStats from "@/components/admin/pricing/price-refresh-run-stats";
import useUrlPage from "@/hooks/use-url-page";
import { resolvePriceRefreshProgress } from "@/lib/price-refresh-ui";
import {
    fetchManualPriceReviewStats,
    fetchActivePriceRefresh,
    fetchPriceRefreshRuns,
    fetchPriceRefreshStatus,
    fetchSupplierPriceFiles,
    startPriceRefresh,
    type PriceRefreshJobStatus,
    type PriceRefreshRunItem,
    type SupplierPriceFileMeta,
} from "@/lib/admin-pricing-api";

export default function AdminPricingRefreshPage() {
    const [page, setPage] = useUrlPage();
    const [runs, setRuns] = useState<PriceRefreshRunItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [priceFiles, setPriceFiles] = useState<SupplierPriceFileMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [jobStatus, setJobStatus] = useState<PriceRefreshJobStatus | null>(null);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [manualQueueCount, setManualQueueCount] = useState(0);
    const [lastCompletedStats, setLastCompletedStats] = useState<Record<string, unknown> | null>(null);

    const loadData = useCallback(async (targetPage: number) => {
        setLoading(true);
        setError("");
        try {
            const [runsRes, filesRes, activeRes, manualStatsRes] = await Promise.all([
                fetchPriceRefreshRuns(targetPage),
                fetchSupplierPriceFiles(),
                fetchActivePriceRefresh(),
                fetchManualPriceReviewStats(),
            ]);
            setRuns(runsRes.data || []);
            setMeta(runsRes);
            setPriceFiles(filesRes.data || []);
            setManualQueueCount(manualStatsRes.data?.active_count ?? 0);
            if (activeRes.data?.job_id) {
                setJobStatus(activeRes.data);
                setRefreshing(activeRes.data.status === "queued" || activeRes.data.status === "running");
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData(page);
    }, [page, loadData]);

    useEffect(() => {
        if (!refreshing || !jobStatus?.job_id) return;
        const timer = setInterval(async () => {
            try {
                const res = await fetchPriceRefreshStatus(jobStatus.job_id);
                if (!res.data) return;
                setJobStatus(res.data);
                if (res.data.status === "completed" || res.data.status === "failed") {
                    setRefreshing(false);
                    if (res.data.status === "completed") {
                        setLastCompletedStats((res.data.stats as Record<string, unknown> | undefined) ?? null);
                        setSuccess("Обновление цен завершено");
                    } else {
                        setSuccess("");
                    }
                    if (res.data.status === "failed") {
                        setError(res.data.message || "Ошибка обновления цен");
                    }
                    void loadData(page);
                }
            } catch {
                // ignore polling errors
            }
        }, 2000);
        return () => clearInterval(timer);
    }, [refreshing, jobStatus?.job_id, loadData, page]);

    const hasUploadedPriceFile = priceFiles.some((file) => Boolean(file.storage_path));

    const handleStartRefresh = async () => {
        if (!hasUploadedPriceFile) {
            setError("Сначала загрузите прайс хотя бы одного поставщика");
            return;
        }
        setRefreshing(true);
        setError("");
        setLastCompletedStats(null);
        try {
            const res = await startPriceRefresh();
            setJobStatus({ job_id: res.job_id, run_id: res.run_id, status: "queued", message: res.message });
            setSuccess("Задача обновления цен запущена");
        } catch (e: unknown) {
            setRefreshing(false);
            setError(e instanceof Error ? e.message : "Не удалось запустить");
        }
    };

    const handleUploaded = async () => {
        setSuccess("Прайс загружен");
        await loadData(page);
    };

    const refreshProgress = resolvePriceRefreshProgress(jobStatus, refreshing);
    const showRefreshProgress =
        refreshing || jobStatus?.status === "queued" || jobStatus?.status === "running";

    return (
        <AdminPageCard>
            <div className="space-y-4 rounded-2xl border bg-white p-6">
                <div>
                    <h1 className="text-lg font-semibold">Обновить цены</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">
                        Пересчёт цен по складам и загруженным прайсам поставщиков по формулам из раздела{" "}
                        <Link href="/admin/pricing/formulas" className="font-medium text-admin-text underline">
                            «Формулы цен»
                        </Link>
                        .
                    </p>
                </div>

                {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
                {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

                {manualQueueCount > 0 ? (
                    <p className="text-sm text-amber-800">
                        В ручной очереди:{" "}
                        <Link href="/admin/pricing/manual-reviews" className="font-medium underline">
                            {manualQueueCount}
                        </Link>
                    </p>
                ) : null}

                <div className="space-y-3 rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold">Загруженные прайсы</h2>
                        <button
                            type="button"
                            onClick={() => setUploadModalOpen(true)}
                            disabled={priceFiles.length === 0}
                            className="rounded-lg border bg-admin-primary px-4 py-2 text-sm text-white disabled:opacity-50"
                        >
                            Загрузить прайсы
                        </button>
                    </div>
                    <SupplierPriceFilesList items={priceFiles} />
                </div>

                <div className="space-y-3 rounded-xl border p-4">
                    <h2 className="text-sm font-semibold">Запуск обновления</h2>
                    <p className="text-xs text-admin-text-secondary">
                        Сначала пересчитывается склад (последний проведённый приход), затем прайсы всех поставщиков с загруженным файлом.
                    </p>
                    {!hasUploadedPriceFile ? (
                        <p className="text-xs text-amber-800">
                            Загрузите прайс поставщика — без него обновление недоступно.
                        </p>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => void handleStartRefresh()}
                        disabled={refreshing || !hasUploadedPriceFile}
                        className="rounded-lg border bg-admin-primary px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {refreshing ? "Обновление..." : "Обновить цены"}
                    </button>
                    {showRefreshProgress ? (
                        <div className="space-y-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-3">
                            <div className="flex items-center justify-between gap-2 text-xs text-emerald-800">
                                <span className="font-medium">
                                    {jobStatus?.phase === "supplier"
                                        ? `Поставщик: ${jobStatus.supplier_name ?? jobStatus.supplier_code ?? "—"}`
                                        : jobStatus?.phase === "warehouse"
                                            ? "Склад"
                                            : "Обновление цен"}
                                </span>
                                {refreshProgress.total > 0 ? (
                                    <span className="shrink-0 tabular-nums text-emerald-700/90">
                                        {refreshProgress.processed} / {refreshProgress.total}
                                    </span>
                                ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-100">
                                    <span
                                        className="block h-full rounded-full bg-emerald-500 transition-all"
                                        style={{ width: `${Math.max(2, refreshProgress.progress)}%` }}
                                    />
                                </span>
                                <span className="shrink-0 text-[11px] font-medium tabular-nums text-emerald-700">
                                    {refreshProgress.progress}%
                                </span>
                            </div>
                            {refreshProgress.message ? (
                                <p className="text-[11px] text-emerald-700/90">{refreshProgress.message}</p>
                            ) : null}
                        </div>
                    ) : jobStatus?.message ? (
                        <p className="text-xs text-admin-text-secondary">{jobStatus.message}</p>
                    ) : null}
                </div>

                {lastCompletedStats ? (
                    <div className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <h2 className="text-sm font-semibold text-green-900">Отчёт об обновлении</h2>
                            <button
                                type="button"
                                onClick={() => setLastCompletedStats(null)}
                                className="text-xs text-green-800 opacity-70 hover:opacity-100"
                            >
                                ✕
                            </button>
                        </div>
                        <PriceRefreshRunStats stats={lastCompletedStats} />
                    </div>
                ) : null}

                {loading ? <AdminLoadingState /> : runs.length === 0 ? (
                    <AdminEmptyState title="Запусков пока нет" description="Загрузите прайс и нажмите «Обновить цены»." />
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

            <SupplierPriceUploadModal
                open={uploadModalOpen}
                suppliers={priceFiles}
                onCloseAction={() => setUploadModalOpen(false)}
                onUploadedAction={handleUploaded}
            />
        </AdminPageCard>
    );
}
