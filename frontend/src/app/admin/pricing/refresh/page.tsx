"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import InStockPricingPreviewTable from "@/components/admin/pricing/in-stock-pricing-preview-table";
import SupplierPriceFilesList from "@/components/admin/pricing/supplier-price-files-list";
import SupplierPriceUploadModal from "@/components/admin/pricing/supplier-price-upload-modal";
import PriceRefreshRunStats from "@/components/admin/pricing/price-refresh-run-stats";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { resolvePriceRefreshProgress } from "@/lib/price-refresh-ui";
import { adminBtnPrimary, adminBtnSecondary, adminBtnSm } from "@/lib/admin-ui-classes";
import {
    fetchActivePriceRefresh,
    fetchInStockPricingPreview,
    fetchManualPriceReviewStats,
    fetchPriceRefreshStatus,
    fetchSupplierPriceFiles,
    startPriceRefresh,
    type InStockPricingPreviewRow,
    type PriceRefreshJobStatus,
    type SupplierPriceFileMeta,
} from "@/lib/admin-pricing-api";

const PER_PAGE_OPTIONS = [25, 50, 100] as const;

const ROLE_OPTIONS = [
    { value: "ordinary", label: "Обычная" },
    { value: "allparfume", label: "Allparfume" },
] as const;

type RoleFilter = "" | "ordinary" | "allparfume";

function formatLastRefreshAt(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Minsk",
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((p) => p.type === type)?.value ?? "";
    const day = get("day");
    const month = get("month");
    const hour = get("hour");
    const minute = get("minute");
    if (!day || !month || !hour || !minute) return null;
    return `${day}.${month} в ${hour}:${minute}`;
}

export default function AdminPricingRefreshPage() {
    const [page, setPage] = useUrlPage();
    const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(50);
    const [searchInput, setSearchInput] = useState("");
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
    const debouncedSearch = useDebouncedValue(searchInput, 350);
    const [previewItems, setPreviewItems] = useState<InStockPricingPreviewRow[]>([]);
    const [previewMeta, setPreviewMeta] = useState<{
        current_page: number;
        last_page: number;
        total: number;
    } | null>(null);
    const [priceFiles, setPriceFiles] = useState<SupplierPriceFileMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [jobStatus, setJobStatus] = useState<PriceRefreshJobStatus | null>(null);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [manualQueueCount, setManualQueueCount] = useState(0);
    const [lastCompletedStats, setLastCompletedStats] = useState<Record<string, unknown> | null>(null);
    const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

    useResetPageOnChange(setPage, [debouncedSearch, perPage, roleFilter]);

    const loadPreview = useCallback(async (targetPage: number) => {
        setLoading(true);
        setError("");
        try {
            const [previewRes, filesRes, activeRes, manualStatsRes] = await Promise.all([
                fetchInStockPricingPreview({
                    page: targetPage,
                    per_page: perPage,
                    search: debouncedSearch || undefined,
                    role: roleFilter || undefined,
                }),
                fetchSupplierPriceFiles(),
                fetchActivePriceRefresh(),
                fetchManualPriceReviewStats(),
            ]);
            setPreviewItems(previewRes.data || []);
            setPreviewMeta(previewRes);
            setLastRefreshAt(previewRes.last_refresh_at ?? null);
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
    }, [debouncedSearch, perPage, roleFilter]);

    useEffect(() => {
        void loadPreview(page);
    }, [page, loadPreview]);

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
                        void loadPreview(page);
                    } else {
                        setSuccess("");
                    }
                    if (res.data.status === "failed") {
                        setError(res.data.message || "Ошибка обновления цен");
                    }
                }
            } catch {
                // ignore polling errors
            }
        }, 2000);
        return () => clearInterval(timer);
    }, [refreshing, jobStatus?.job_id, loadPreview, page]);

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
        await loadPreview(page);
    };

    const refreshProgress = resolvePriceRefreshProgress(jobStatus, refreshing);
    const showRefreshProgress =
        refreshing || jobStatus?.status === "queued" || jobStatus?.status === "running";
    const lastRefreshLabel = formatLastRefreshAt(lastRefreshAt);

    return (
        <AdminPageCard>
            <div className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="shrink-0 text-lg font-semibold">Обновить цены</h1>
                            {lastRefreshLabel ? (
                                <span className="inline-flex min-w-0 items-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-900 sm:px-2.5 sm:py-1 sm:text-xs">
                                    Обновлено {lastRefreshLabel}
                                </span>
                            ) : (
                                <span className="inline-flex min-w-0 items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 sm:px-2.5 sm:py-1 sm:text-xs">
                                    Ещё не обновляли
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleStartRefresh()}
                            disabled={refreshing || !hasUploadedPriceFile}
                            className={`${adminBtnPrimary} h-9 w-full shrink-0 px-3 text-xs disabled:opacity-50 sm:h-8 sm:w-auto`}
                            title={!hasUploadedPriceFile ? "Сначала загрузите прайс поставщика" : undefined}
                        >
                            {refreshing ? "Обновление…" : "Обновить цены"}
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href="/admin/pricing/history" className={adminBtnSm}>
                            История
                        </Link>
                        <Link href="/admin/pricing/formulas" className={adminBtnSm}>
                            Формулы цен
                        </Link>
                        <Link href="/admin/pricing/logic" className={adminBtnSm}>
                            Логика цен
                        </Link>
                        <Link
                            href="/admin/pricing/manual-reviews"
                            className={`${adminBtnSm} gap-1.5 ${manualQueueCount > 0 ? "border-amber-300 bg-amber-50 text-amber-950" : ""}`}
                        >
                            <span>Ручная очередь</span>
                            {manualQueueCount > 0 ? (
                                <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-amber-950">
                                    {manualQueueCount}
                                </span>
                            ) : null}
                        </Link>
                        <button
                            type="button"
                            onClick={() => setUploadModalOpen(true)}
                            disabled={priceFiles.length === 0}
                            className={`${adminBtnSecondary} h-8 px-3 text-xs disabled:opacity-50`}
                        >
                            Загрузить прайсы
                        </button>
                    </div>
                </div>

                {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
                {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

                <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <SupplierPriceFilesList items={priceFiles} />
                    </div>
                </div>

                {showRefreshProgress ? (
                    <div className="space-y-1 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2">
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
                ) : null}

                {lastCompletedStats ? (
                    <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
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

                <div className="space-y-2">
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
                            <InStockPricingPreviewTable items={previewItems} />
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

            <SupplierPriceUploadModal
                open={uploadModalOpen}
                suppliers={priceFiles}
                onCloseAction={() => setUploadModalOpen(false)}
                onUploadedAction={handleUploaded}
            />
        </AdminPageCard>
    );
}
