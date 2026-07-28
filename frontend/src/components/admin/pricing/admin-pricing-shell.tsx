"use client";

import Link from "next/link";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import SupplierPriceUploadModal from "@/components/admin/pricing/supplier-price-upload-modal";
import { resolvePriceRefreshProgress } from "@/lib/price-refresh-ui";
import { adminBtnPrimary, adminBtnSecondary } from "@/lib/admin-ui-classes";
import {
    fetchActivePriceRefresh,
    fetchManualPriceReviewStats,
    fetchPriceRefreshRuns,
    fetchPriceRefreshStatus,
    fetchSupplierPriceFiles,
    startPriceRefresh,
    type PriceRefreshJobStatus,
    type SupplierPriceFileMeta,
} from "@/lib/admin-pricing-api";
import PriceRefreshRunStats from "@/components/admin/pricing/price-refresh-run-stats";

type PricingShellContextValue = {
    contentEpoch: number;
    bumpContent: () => void;
    priceFiles: SupplierPriceFileMeta[];
    manualQueueCount: number;
    openUploadModal: () => void;
};

const PricingShellContext = createContext<PricingShellContextValue | null>(null);

export function useAdminPricingShell(): PricingShellContextValue {
    const ctx = useContext(PricingShellContext);
    if (!ctx) {
        throw new Error("useAdminPricingShell must be used within AdminPricingShell");
    }
    return ctx;
}

const NAV_ITEMS = [
    {
        href: "/admin/pricing/refresh",
        label: "Обновление цен",
        match: (path: string) =>
            path === "/admin/pricing" ||
            path.startsWith("/admin/pricing/refresh"),
    },
    { href: "/admin/pricing/history", label: "История", match: (path: string) => path.startsWith("/admin/pricing/history") },
    { href: "/admin/pricing/formulas", label: "Формулы цен", match: (path: string) => path.startsWith("/admin/pricing/formulas") },
    { href: "/admin/pricing/logic", label: "Логика цен", match: (path: string) => path.startsWith("/admin/pricing/logic") },
    {
        href: "/admin/pricing/manual-reviews",
        label: "Ручная очередь",
        match: (path: string) => path.startsWith("/admin/pricing/manual-reviews"),
        showCount: true,
    },
] as const;

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

function navClass(active: boolean, emphasizeQueue = false): string {
    const base =
        "relative inline-flex items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-0.5 text-sm transition-colors";
    if (active) {
        return `${base} border-admin-primary font-semibold text-admin-text`;
    }
    if (emphasizeQueue) {
        return `${base} border-transparent font-medium text-amber-800 hover:text-amber-950`;
    }
    return `${base} border-transparent font-medium text-admin-text-secondary hover:text-admin-text`;
}

export default function AdminPricingShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [contentEpoch, setContentEpoch] = useState(0);
    const [priceFiles, setPriceFiles] = useState<SupplierPriceFileMeta[]>([]);
    const [manualQueueCount, setManualQueueCount] = useState(0);
    const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [jobStatus, setJobStatus] = useState<PriceRefreshJobStatus | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [lastCompletedStats, setLastCompletedStats] = useState<Record<string, unknown> | null>(null);

    const bumpContent = useCallback(() => {
        setContentEpoch((n) => n + 1);
    }, []);

    const loadMeta = useCallback(async () => {
        try {
            const [filesRes, manualStatsRes, runsRes, activeRes] = await Promise.all([
                fetchSupplierPriceFiles(),
                fetchManualPriceReviewStats(),
                fetchPriceRefreshRuns(1),
                fetchActivePriceRefresh(),
            ]);
            setPriceFiles(filesRes.data || []);
            setManualQueueCount(manualStatsRes.data?.active_count ?? 0);
            const lastRun = (runsRes.data || [])[0] ?? null;
            setLastRefreshAt(lastRun?.finished_at ?? lastRun?.created_at ?? null);
            if (activeRes.data?.job_id) {
                setJobStatus(activeRes.data);
                setRefreshing(activeRes.data.status === "queued" || activeRes.data.status === "running");
            }
        } catch {
            // header meta is best-effort
        }
    }, []);

    useEffect(() => {
        void loadMeta();
    }, [loadMeta, contentEpoch]);

    useEffect(() => {
        if (!refreshing || !jobStatus?.job_id) {
            return;
        }
        const timer = setInterval(() => {
            void (async () => {
                try {
                    const res = await fetchPriceRefreshStatus(jobStatus.job_id);
                    if (!res.data) {
                        return;
                    }
                    setJobStatus(res.data);
                    if (res.data.status === "completed" || res.data.status === "failed") {
                        setRefreshing(false);
                        if (res.data.status === "completed") {
                            setLastCompletedStats(
                                (res.data.stats as Record<string, unknown> | undefined) ?? null,
                            );
                            setSuccess("Обновление цен завершено");
                            bumpContent();
                            void loadMeta();
                        } else {
                            setError(res.data.message || "Ошибка обновления цен");
                        }
                    }
                } catch {
                    // ignore polling errors
                }
            })();
        }, 2000);
        return () => clearInterval(timer);
    }, [refreshing, jobStatus?.job_id, bumpContent, loadMeta]);

    const hasUploadedPriceFile = priceFiles.some((file) => Boolean(file.storage_path));
    const lastRefreshLabel = formatLastRefreshAt(lastRefreshAt);
    const refreshProgress = resolvePriceRefreshProgress(jobStatus, refreshing);
    const showRefreshProgress =
        refreshing || jobStatus?.status === "queued" || jobStatus?.status === "running";

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
            setJobStatus({
                job_id: res.job_id,
                run_id: res.run_id,
                status: "queued",
                message: res.message,
            });
            setSuccess("Задача обновления цен запущена");
            if (!pathname.startsWith("/admin/pricing/refresh")) {
                router.push("/admin/pricing/refresh");
            }
        } catch (e: unknown) {
            setRefreshing(false);
            setError(e instanceof Error ? e.message : "Не удалось запустить");
        }
    };

    const handleUploaded = async () => {
        setSuccess("Прайс загружен");
        await loadMeta();
        bumpContent();
    };

    const ctx = useMemo<PricingShellContextValue>(
        () => ({
            contentEpoch,
            bumpContent,
            priceFiles,
            manualQueueCount,
            openUploadModal: () => setUploadModalOpen(true),
        }),
        [contentEpoch, bumpContent, priceFiles, manualQueueCount],
    );

    const isRefreshPage =
        pathname === "/admin/pricing" || pathname.startsWith("/admin/pricing/refresh");

    return (
        <PricingShellContext.Provider value={ctx}>
            <AdminPageCard>
                <div className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <h1 className="shrink-0 text-lg font-semibold text-admin-text">
                                    Обновление цен
                                </h1>
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
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                {isRefreshPage ? (
                                    <button
                                        type="button"
                                        onClick={() => setUploadModalOpen(true)}
                                        disabled={priceFiles.length === 0}
                                        className={`${adminBtnSecondary} h-9 w-full px-3 text-xs disabled:opacity-50 sm:h-8 sm:w-auto`}
                                    >
                                        Загрузить прайсы
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => void handleStartRefresh()}
                                    disabled={refreshing || !hasUploadedPriceFile}
                                    className={`${adminBtnPrimary} h-9 w-full px-3 text-xs disabled:opacity-50 sm:h-8 sm:w-auto`}
                                    title={!hasUploadedPriceFile ? "Сначала загрузите прайс поставщика" : undefined}
                                >
                                    {refreshing ? "Обновление…" : "Обновить цены"}
                                </button>
                            </div>
                        </div>
                        <nav
                            className="-mx-1 flex gap-4 overflow-x-auto border-b border-admin-border px-1"
                            aria-label="Раздел цен"
                        >
                            {NAV_ITEMS.map((item) => {
                                const active = item.match(pathname);
                                const emphasizeQueue =
                                    "showCount" in item && item.showCount && manualQueueCount > 0 && !active;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={navClass(active, emphasizeQueue)}
                                    >
                                        <span className="whitespace-nowrap">{item.label}</span>
                                        {"showCount" in item && item.showCount && manualQueueCount > 0 ? (
                                            <span
                                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none ${
                                                    active
                                                        ? "bg-admin-primary text-white"
                                                        : "bg-amber-100 text-amber-900"
                                                }`}
                                            >
                                                {manualQueueCount}
                                            </span>
                                        ) : null}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    {error ? (
                        <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                    ) : null}
                    {success ? (
                        <AdminFeedbackMessage
                            type="success"
                            message={success}
                            onCloseAction={() => setSuccess("")}
                        />
                    ) : null}

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
                                    className="text-xs text-green-800 underline"
                                >
                                    Скрыть
                                </button>
                            </div>
                            <PriceRefreshRunStats stats={lastCompletedStats} />
                        </div>
                    ) : null}

                    {children}
                </div>

                <SupplierPriceUploadModal
                    open={uploadModalOpen}
                    suppliers={priceFiles}
                    onCloseAction={() => setUploadModalOpen(false)}
                    onUploadedAction={() => void handleUploaded()}
                />
            </AdminPageCard>
        </PricingShellContext.Provider>
    );
}
