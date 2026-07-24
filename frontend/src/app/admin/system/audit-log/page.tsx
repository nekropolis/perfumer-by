"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    fetchAuditLogs,
    type AuditLogRow,
    type PaginatedAuditLogs,
} from "@/lib/admin-audit-log-api";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import type { AdminToast } from "@/types/admin";

const ENTITY_LABELS: Record<string, string> = {
    vanille_import: "Импорт Vanille",
    brand_sync: "Синхронизация брендов",
    veter_ticket: "Ветер (курьер)",
};

const ACTION_LABELS: Record<string, string> = {
    success: "Успех",
    failed: "Провал",
    error: "Ошибка",
    running: "В процессе",
    created: "Создание",
    updated: "Изменение",
    deleted: "Удаление",
    info: "Инфо",
};

function entityLabel(type: string): string {
    return ENTITY_LABELS[type] ?? type;
}

function actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
}

function actionBadgeClass(action: string): string {
    if (action === "success" || action === "created") {
        return "bg-emerald-50 text-emerald-800 ring-emerald-100";
    }

    if (action === "failed") {
        return "bg-red-50 text-red-800 ring-red-100";
    }

    if (action === "error") {
        return "bg-amber-50 text-amber-900 ring-amber-100";
    }

    if (action === "running" || action === "info") {
        return "bg-sky-50 text-sky-900 ring-sky-100";
    }

    if (action === "updated") {
        return "bg-violet-50 text-violet-900 ring-violet-100";
    }

    if (action === "deleted") {
        return "bg-gray-100 text-admin-text ring-gray-200";
    }

    return "bg-admin-muted text-admin-text ring-gray-100";
}

function formatWhen(iso: string): string {
    try {
        return new Date(iso).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return iso;
    }
}

type DetailModalProps = {
    row: AuditLogRow | null;
    onCloseAction: () => void;
};

function AuditLogDetailModal({ row, onCloseAction }: DetailModalProps) {
    if (!row) {
        return null;
    }

    const payload = {
        id: row.id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        summary: row.summary,
        context: row.context,
        actor_id: row.actor_id,
        actor: row.actor ?? null,
        ip_address: row.ip_address,
        created_at: row.created_at,
    };

    const json = JSON.stringify(payload, null, 2);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="audit-detail-title"
            >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
                    <div>
                        <h2 id="audit-detail-title" className="text-lg font-semibold">
                            Запись аудита #{row.id}
                        </h2>
                        <p className="mt-1 text-xs text-admin-text-secondary">
                            {entityLabel(row.entity_type)}
                            {row.entity_id != null ? ` · ID сущности ${row.entity_id}` : ""}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-lg leading-none text-admin-text-secondary hover:bg-admin-muted"
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                    <div className="rounded-xl bg-admin-muted px-3 py-2 text-sm text-admin-text">
                        {row.summary}
                    </div>

                    <pre className="max-h-[480px] overflow-auto rounded-xl border border-admin-border bg-gray-900/95 p-3 text-[11px] leading-relaxed text-gray-100">
                        {json}
                    </pre>
                </div>

                <div className="shrink-0 border-t px-5 py-3 text-right">
                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="rounded-lg border border-admin-border px-4 py-2 text-sm hover:bg-admin-muted"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
}

const ENTITY_FILTER_OPTIONS = [
    { value: "", label: "Все сущности" },
    { value: "vanille_import", label: "Импорт Vanille" },
    { value: "brand_sync", label: "Синхронизация брендов" },
];

const ACTION_FILTER_OPTIONS = [
    { value: "", label: "Все действия" },
    { value: "success", label: "Успех" },
    { value: "failed", label: "Провал" },
    { value: "error", label: "Ошибка" },
    { value: "running", label: "В процессе" },
    { value: "created", label: "Создание" },
    { value: "updated", label: "Изменение" },
    { value: "deleted", label: "Удаление" },
    { value: "info", label: "Инфо" },
];

export default function AdminAuditLogPage() {
    const [rows, setRows] = useState<AuditLogRow[]>([]);
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState<Omit<PaginatedAuditLogs, "data"> | null>(null);
    const [loading, setLoading] = useState(true);
    const [entityFilter, setEntityFilter] = useState("");
    const [actionFilter, setActionFilter] = useState("");
    const [detailRow, setDetailRow] = useState<AuditLogRow | null>(null);
    const [toast, setToast] = useState<AdminToast | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setToast(null);

        try {
            const res = await fetchAuditLogs({
                page,
                per_page: 25,
                entity_type: entityFilter || undefined,
                action: actionFilter || undefined,
            });

            setRows(res.data);
            setMeta({
                current_page: res.current_page,
                last_page: res.last_page,
                per_page: res.per_page,
                total: res.total,
            });
        } catch (e) {
            console.error(e);
            setToast({ type: "error", message: "Не удалось загрузить журнал аудита" });
            setRows([]);
            setMeta(null);
        } finally {
            setLoading(false);
        }
    }, [page, entityFilter, actionFilter]);

    useEffect(() => {
        void load();
    }, [load]);

    const paginationLabel = useMemo(() => {
        if (!meta) {
            return "";
        }

        return `Стр. ${meta.current_page} из ${meta.last_page} · всего ${meta.total}`;
    }, [meta]);

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Журнал аудита"
                description="События по импорту и другим сущностям (будет расширяться)"
            >
                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs text-admin-text-secondary">
                        <span>Сущность</span>
                        <select
                            value={entityFilter}
                            onChange={(e) => {
                                setEntityFilter(e.target.value);
                                setPage(1);
                            }}
                            className="min-w-[200px] rounded-lg border px-3 py-2 text-sm"
                        >
                            {ENTITY_FILTER_OPTIONS.map((o) => (
                                <option key={o.value || "all"} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1 text-xs text-admin-text-secondary">
                        <span>Действие</span>
                        <select
                            value={actionFilter}
                            onChange={(e) => {
                                setActionFilter(e.target.value);
                                setPage(1);
                            }}
                            className="min-w-[180px] rounded-lg border px-3 py-2 text-sm"
                        >
                            {ACTION_FILTER_OPTIONS.map((o) => (
                                <option key={o.value || "all-act"} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </AdminTableToolbar>

            {loading && <AdminLoadingState text="Загрузка журнала..." />}

            {!loading && rows.length === 0 && (
                <AdminEmptyState
                    title="Записей пока нет"
                    description="События появятся после действий в админке (например, импорт Vanille)."
                />
            )}

            {!loading && rows.length > 0 && (
                <>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Сущность</th>
                                    <th className="px-4 py-3">Статус / действие</th>
                                    <th className="px-4 py-3">Время</th>
                                    <th className="px-4 py-3 text-right">Подробнее</th>
                                </tr>
                            </thead>
                            <tbody className="align-middle">
                                {rows.map((row) => (
                                    <tr key={row.id} className="border-b last:border-b-0">
                                        <td className="px-4 py-3 font-mono text-xs text-admin-text">{row.id}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{entityLabel(row.entity_type)}</div>
                                            {row.entity_id != null ? (
                                                <div className="text-xs text-admin-text-secondary">#{row.entity_id}</div>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${actionBadgeClass(row.action)}`}
                                            >
                                                {actionLabel(row.action)}
                                            </span>
                                            <div className="mt-1 line-clamp-2 text-xs text-admin-text-secondary">{row.summary}</div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-xs text-admin-text-secondary">
                                            {formatWhen(row.created_at)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => setDetailRow(row)}
                                                className="rounded-lg border border-admin-border px-3 py-1.5 text-xs font-medium hover:bg-admin-muted"
                                            >
                                                Открыть
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {meta && meta.last_page > 1 ? (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-admin-text-secondary">
                            <span>{paginationLabel}</span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={meta.current_page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
                                >
                                    Назад
                                </button>
                                <button
                                    type="button"
                                    disabled={meta.current_page >= meta.last_page}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
                                >
                                    Вперёд
                                </button>
                            </div>
                        </div>
                    ) : null}
                </>
            )}

            <AuditLogDetailModal row={detailRow} onCloseAction={() => setDetailRow(null)} />

            {toast ? (
                <AdminFeedbackMessage
                    type={toast.type}
                    message={toast.message}
                    onCloseAction={() => setToast(null)}
                />
            ) : null}
        </AdminPageCard>
    );
}
