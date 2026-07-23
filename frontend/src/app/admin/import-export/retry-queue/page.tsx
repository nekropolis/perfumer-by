"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    dismissImportRetryItem,
    fetchImportRetryQueue,
    retryOneImportRetryItem,
    runBulkImportRetry,
    type ImportRetryQueueCounts,
    type ImportRetryQueueRow,
    type ImportRetryTaskType,
} from "@/lib/admin-import-retry-queue-api";

const TASK_OPTIONS: { value: ImportRetryTaskType; label: string }[] = [
    { value: "vanille_catalog_images", label: "Каталожные картинки" },
    { value: "vanille_product_images", label: "Галерея карточки" },
    { value: "description_rewrite", label: "Описание (LLM)" },
];

type StatusFilter = "all" | "pending" | "dismissed" | "resolved";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: "pending", label: "pending" },
    { value: "dismissed", label: "dismissed" },
    { value: "resolved", label: "resolved" },
];

export default function ImportRetryQueuePage() {
    const [taskType, setTaskType] = useState<ImportRetryTaskType | "">("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
    const [rows, setRows] = useState<ImportRetryQueueRow[]>([]);
    const [counts, setCounts] = useState<ImportRetryQueueCounts | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 25, total: 0 });

    const load = useCallback(
        async (targetPage = page) => {
            setLoading(true);
            setError("");
            try {
                const data = await fetchImportRetryQueue({
                    task_type: taskType || undefined,
                    status: statusFilter === "all" ? "all" : statusFilter,
                    page: targetPage,
                    per_page: 25,
                });
                setRows(data.data || []);
                setCounts(data.counts ?? null);
                setMeta({
                    current_page: data.current_page,
                    last_page: data.last_page,
                    per_page: data.per_page,
                    total: data.total,
                });
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки");
            } finally {
                setLoading(false);
            }
        },
        [page, taskType, statusFilter]
    );

    useResetPageOnChange(setPage, [taskType, statusFilter]);

    useEffect(() => {
        void load(page);
    }, [load, page]);

    const handleDismiss = async (row: ImportRetryQueueRow) => {
        const key = `d-${row.id}`;
        setBusyId(key);
        try {
            await dismissImportRetryItem(row.task_type as ImportRetryTaskType, row.product_id);
            await load(page);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка");
        } finally {
            setBusyId(null);
        }
    };

    const handleRetryOne = async (row: ImportRetryQueueRow) => {
        const key = `r-${row.id}`;
        setBusyId(key);
        try {
            await retryOneImportRetryItem(row.task_type as ImportRetryTaskType, row.product_id);
            await load(page);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка");
        } finally {
            setBusyId(null);
        }
    };

    const handleBulk = async () => {
        if (!taskType) {
            setError("Выберите тип задачи для массового повтора");
            return;
        }
        setBusyId("bulk");
        try {
            await runBulkImportRetry(taskType);
            await load(page);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <AdminPageCard>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Очередь ошибок импорта</h1>
                    <p className="text-xs text-admin-text-secondary">
                        Повтор и снятие с очереди по задачам Vanille / описаниям.{" "}
                        <Link href="/admin/import-export/vanille-parsing" className="underline">
                            ← Vanille
                        </Link>
                    </p>
                </div>
                <button
                    type="button"
                    disabled={busyId !== null || !taskType}
                    onClick={() => void handleBulk()}
                    className="rounded-lg border bg-white px-3 py-2 text-xs disabled:opacity-50"
                >
                    {busyId === "bulk" ? "Запуск…" : "Фон: повторить все (выбранный тип)"}
                </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-3">
                <AdminFilterSelect
                    value={taskType}
                    onChangeAction={(v) => setTaskType((v || "") as ImportRetryTaskType | "")}
                    options={TASK_OPTIONS}
                    placeholder="Все типы"
                />
                <AdminFilterSelect
                    value={statusFilter === "all" ? "" : statusFilter}
                    onChangeAction={(v) =>
                        setStatusFilter((v === "" ? "all" : v) as StatusFilter)
                    }
                    options={STATUS_OPTIONS}
                    placeholder="Все статусы"
                />
            </div>

            {counts?.pending_total != null ? (
                <div className="mb-4 rounded-lg border bg-admin-muted px-3 py-2 text-xs text-admin-text">
                    <span className="font-medium">В очереди (pending):</span> {counts.pending_total}
                    {counts.pending_by_task && Object.keys(counts.pending_by_task).length > 0 ? (
                        <span className="ml-2 font-mono text-[11px]">
                            {Object.entries(counts.pending_by_task).map(([k, v]) => `${k}=${v}`).join(" · ")}
                        </span>
                    ) : null}
                </div>
            ) : null}

            {error ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState />
            ) : rows.length === 0 ? (
                <AdminEmptyState title="Пусто" description="Нет записей для текущих фильтров." />
            ) : (
                <div className="overflow-x-auto rounded-xl border bg-white">
                    <table className="min-w-full text-left text-sm">
                        <thead className="border-b bg-admin-muted text-xs uppercase text-admin-text-secondary">
                            <tr>
                                <th className="px-3 py-2">ID</th>
                                <th className="px-3 py-2">Тип</th>
                                <th className="px-3 py-2">Статус</th>
                                <th className="px-3 py-2">Товар</th>
                                <th className="px-3 py-2">Попытки</th>
                                <th className="px-3 py-2">Ошибка</th>
                                <th className="px-3 py-2 text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-b last:border-0">
                                    <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                                    <td className="px-3 py-2 text-xs">{row.task_type}</td>
                                    <td className="px-3 py-2 text-xs">{row.status}</td>
                                    <td className="px-3 py-2">
                                        {row.product ? (
                                            <Link
                                                href={`/admin/products/${row.product.id}`}
                                                className="text-blue-700 underline"
                                            >
                                                {row.product.name}
                                            </Link>
                                        ) : (
                                            <span className="text-admin-text-secondary">#{row.product_id}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">{row.attempts}</td>
                                    <td className="max-w-md truncate px-3 py-2 text-xs text-admin-text" title={row.last_error || ""}>
                                        {row.last_error || "—"}
                                    </td>
                                    <td className="space-x-2 px-3 py-2 text-right whitespace-nowrap">
                                        <button
                                            type="button"
                                            disabled={busyId !== null || row.status !== "pending"}
                                            onClick={() => void handleRetryOne(row)}
                                            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                        >
                                            {busyId === `r-${row.id}` ? "…" : "Повтор"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busyId !== null || row.status !== "pending"}
                                            onClick={() => void handleDismiss(row)}
                                            className="rounded border border-gray-300 px-2 py-1 text-xs text-admin-text disabled:opacity-50"
                                        >
                                            {busyId === `d-${row.id}` ? "…" : "Снять"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {meta.last_page > 1 ? (
                <div className="mt-4">
                    <AdminPagination
                        currentPage={page}
                        lastPage={meta.last_page}
                        onPrevAction={() => setPage(Math.max(1, page - 1))}
                        onNextAction={() => setPage(Math.min(meta.last_page, page + 1))}
                    />
                </div>
            ) : null}
        </AdminPageCard>
    );
}
