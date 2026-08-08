"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import SeoSectionTabs from "@/components/admin/seo/seo-section-tabs";
import { adminBtnPrimary, adminBtnSecondary } from "@/lib/admin-ui-classes";
import useUrlPage from "@/hooks/use-url-page";
import {
    fetchProductSeoBatches,
    fetchProductSeoWorkOverview,
    pullProductSeoReady,
    submitProductSeoWork,
    type ProductSeoBatchItem,
    type ProductSeoWorkOverview,
} from "@/lib/admin-seo-product-descriptions-api";

function formatDate(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ru-RU");
}

function statusLabel(status: ProductSeoBatchItem["status"]): string {
    switch (status) {
        case "pending":
            return "Ожидает";
        case "submitted":
            return "Отправлено";
        case "failed":
            return "Ошибка";
        default:
            return status;
    }
}

export default function AdminSeoProductDescriptionsPage() {
    const [page, setPage] = useUrlPage();
    const [overview, setOverview] = useState<ProductSeoWorkOverview | null>(null);
    const [batches, setBatches] = useState<ProductSeoBatchItem[]>([]);
    const [meta, setMeta] = useState<{
        current_page: number;
        last_page: number;
        total: number;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [overviewRes, batchesRes] = await Promise.all([
                fetchProductSeoWorkOverview(),
                fetchProductSeoBatches({ page, per_page: 25 }),
            ]);
            setOverview(overviewRes.data);
            setBatches(batchesRes.data || []);
            setMeta({
                current_page: batchesRes.current_page,
                last_page: batchesRes.last_page,
                total: batchesRes.total,
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки SEO-очереди");
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleSubmitWork = async () => {
        setWorking(true);
        setError("");
        setSuccess("");
        try {
            const res = await submitProductSeoWork();
            setSuccess(
                res.message ||
                    `Отправлено: ${res.data.requested_count}, принято: ${res.data.accepted_count}`,
            );
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось отправить пачку");
        } finally {
            setWorking(false);
        }
    };

    const handlePullReady = async () => {
        setPulling(true);
        setError("");
        setSuccess("");
        try {
            const res = await pullProductSeoReady();
            setSuccess(
                `Готово: получено ${res.data.fetched}, применено ${res.data.applied}, ошибок ${res.data.failed}, ack ${res.data.acked}`,
            );
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось забрать готовые описания");
        } finally {
            setPulling(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "SEO" },
                    { label: "Описание продуктов" },
                ]}
            />

            <SeoSectionTabs />

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Описание продуктов</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">
                        Отправка чанков в SEO Description и забор готовых полей:
                        SEO description, краткое описание, описание.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={adminBtnSecondary}
                        disabled={pulling || loading}
                        onClick={() => void handlePullReady()}
                    >
                        {pulling ? "Забираем…" : "Забрать готовые"}
                    </button>
                    <button
                        type="button"
                        className={adminBtnPrimary}
                        disabled={working || loading}
                        onClick={() => void handleSubmitWork()}
                    >
                        {working ? "Отправка…" : "Получить описание"}
                    </button>
                </div>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="error"
                        message={error}
                        onCloseAction={() => setError("")}
                    />
                </div>
            ) : null}
            {success ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="success"
                        message={success}
                        onCloseAction={() => setSuccess("")}
                    />
                </div>
            ) : null}

            {loading && !overview ? (
                <AdminLoadingState text="Загрузка…" />
            ) : (
                <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-admin-border bg-white p-3">
                            <div className="text-xs text-admin-text-secondary">К обработке</div>
                            <div className="mt-1 text-xl font-semibold tabular-nums">
                                {overview?.eligible_products ?? 0}
                            </div>
                        </div>
                        <div className="rounded-xl border border-admin-border bg-white p-3">
                            <div className="text-xs text-admin-text-secondary">Нет SEO description</div>
                            <div className="mt-1 text-xl font-semibold tabular-nums">
                                {overview?.missing_fields.seo_description ?? 0}
                            </div>
                        </div>
                        <div className="rounded-xl border border-admin-border bg-white p-3">
                            <div className="text-xs text-admin-text-secondary">Нет краткого описания</div>
                            <div className="mt-1 text-xl font-semibold tabular-nums">
                                {overview?.missing_fields.short_description ?? 0}
                            </div>
                        </div>
                        <div className="rounded-xl border border-admin-border bg-white p-3">
                            <div className="text-xs text-admin-text-secondary">Полностью получено</div>
                            <div className="mt-1 text-xl font-semibold tabular-nums">
                                {overview?.receipts_complete ?? 0}
                            </div>
                        </div>
                    </div>

                    {overview?.remote_error ? (
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            Статистика SEO API недоступна: {overview.remote_error}
                        </div>
                    ) : overview?.remote ? (
                        <div className="mb-4 rounded-lg border border-admin-border bg-admin-muted px-3 py-2 text-xs text-admin-text-secondary">
                            Remote: {JSON.stringify(overview.remote)}
                        </div>
                    ) : null}

                    <div className="mb-2 text-sm font-medium text-admin-text">Чанки отправки</div>
                    {batches.length === 0 ? (
                        <AdminEmptyState
                            title="Чанков пока нет"
                            description="Нажмите «Получить описание», чтобы отправить первую пачку."
                        />
                    ) : (
                        <>
                            <AdminTableShell>
                                <table className="min-w-full text-left text-sm">
                                    <thead className="bg-admin-muted text-xs uppercase text-admin-text-secondary">
                                        <tr>
                                            <th className="px-3 py-2">ID</th>
                                            <th className="px-3 py-2">Batch</th>
                                            <th className="px-3 py-2">Статус</th>
                                            <th className="px-3 py-2 text-right">Отправлено</th>
                                            <th className="px-3 py-2 text-right">Принято</th>
                                            <th className="px-3 py-2 text-right">Применено</th>
                                            <th className="px-3 py-2 text-right">Ошибки</th>
                                            <th className="px-3 py-2">Создан</th>
                                            <th className="px-3 py-2">Ошибка</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batches.map((batch) => (
                                            <tr
                                                key={batch.id}
                                                className="border-t border-admin-border align-top"
                                            >
                                                <td className="px-3 py-2 tabular-nums">{batch.id}</td>
                                                <td className="px-3 py-2 font-mono text-xs">
                                                    {batch.external_batch_id || "—"}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {statusLabel(batch.status)}
                                                    {batch.force ? (
                                                        <span className="ml-1 text-xs text-amber-700">
                                                            force
                                                        </span>
                                                    ) : null}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {batch.requested_count}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {batch.accepted_count}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {batch.applied_count}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {batch.failed_count}
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap text-xs text-admin-text-secondary">
                                                    {formatDate(batch.created_at)}
                                                </td>
                                                <td className="max-w-[220px] px-3 py-2 text-xs text-red-700">
                                                    {batch.error || "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </AdminTableShell>
                            {meta ? (
                                <div className="mt-3">
                                    <AdminPagination
                                        currentPage={meta.current_page}
                                        lastPage={meta.last_page}
                                        onPrevAction={() => setPage(Math.max(1, meta.current_page - 1))}
                                        onNextAction={() =>
                                            setPage(Math.min(meta.last_page, meta.current_page + 1))
                                        }
                                    />
                                </div>
                            ) : null}
                        </>
                    )}
                </>
            )}
        </AdminPageCard>
    );
}
