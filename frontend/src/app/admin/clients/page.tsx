"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import {
    deleteAdminClient,
    fetchAdminClientOrdersHistory,
    fetchAdminClients,
    type AdminClientOrderHistoryItem,
    type AdminClient,
} from "@/lib/admin-clients-api";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import useDebouncedValue from "@/hooks/use-debounced-value";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { AdminToast } from "@/types/admin";

function resolveClientState(client: AdminClient): { label: string; className: string } {
    const isVerified = Boolean(client.phone_verified_at);
    const ordersCount = Number(client.orders_count ?? 0);

    if (isVerified) {
        return {
            label: "Зарегистрирован",
            className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
    }

    if (ordersCount > 0) {
        return {
            label: "Только заказ",
            className: "bg-amber-50 text-amber-700 border-amber-200",
        };
    }

    return {
        label: "Без активности",
        className: "bg-admin-muted text-admin-text-secondary border-admin-border",
    };
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU");
}

export default function AdminClientsPage() {
    const searchParamsFromUrl = useSearchParams();

    const [clients, setClients] = useState<AdminClient[]>([]);
    const [search, setSearch] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<{
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    } | null>(null);
    const [toast, setToast] = useState<AdminToast | null>(null);
    const [deletingClientId, setDeletingClientId] = useState<number | null>(null);
    const [historyClient, setHistoryClient] = useState<AdminClient | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRows, setHistoryRows] = useState<AdminClientOrderHistoryItem[]>([]);

    const debouncedSearch = useDebouncedValue(search, 400);
    useResetPageOnChange(setPage, [debouncedSearch]);

    useEffect(() => {
        const loadClients = async () => {
            setLoading(true);
            setToast(null);

            try {
                const response = await fetchAdminClients({ search: debouncedSearch, page });
                setClients(response.data);
                setMeta(response.meta);
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить клиентов" });
            } finally {
                setLoading(false);
            }
        };

        void loadClients();
    }, [debouncedSearch, page]);

    const handleDeleteClient = async (clientId: number) => {
        if (!window.confirm("Удалить клиента? Действие нельзя отменить.")) {
            return;
        }
        setToast(null);
        try {
            setDeletingClientId(clientId);
            await deleteAdminClient(clientId);
            setClients((prev) => prev.filter((c) => c.id !== clientId));
            setToast({ type: "success", message: "Клиент удалён" });
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось удалить клиента" });
        } finally {
            setDeletingClientId(null);
        }
    };

    const handleOpenOrdersHistory = async (client: AdminClient) => {
        setHistoryClient(client);
        setHistoryRows([]);
        setHistoryLoading(true);
        try {
            const response = await fetchAdminClientOrdersHistory(client.id);
            setHistoryRows(response.data ?? []);
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось загрузить историю заказов" });
        } finally {
            setHistoryLoading(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Клиенты"
                description="CRUD клиентов: редактирование профиля, просмотр карты и истории заказов"
                action={(
                    <Link
                        href="/admin/clients/create"
                        className="inline-flex items-center justify-center rounded-lg bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover"
                    >
                        Создать клиента
                    </Link>
                )}
            />

            <AdminTableShell
                total={meta?.total ?? clients.length}
                search={
                    <AdminSearchInput
                        value={search}
                        onChangeAction={setSearch}
                        placeholder="Имя, телефон, email"
                    />
                }
                footer={
                    <AdminPagination
                        currentPage={meta?.current_page ?? page}
                        lastPage={meta?.last_page ?? 1}
                        onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                        onNextAction={() => setPage((p) => (meta && meta.current_page < meta.last_page ? p + 1 : p))}
                    />
                }
            >
                {loading && clients.length === 0 ? (
                    <AdminLoadingState text="Загрузка клиентов..." />
                ) : clients.length === 0 ? (
                    <AdminEmptyState
                        title="Клиенты не найдены"
                        description="Попробуйте изменить поисковый запрос."
                    />
                ) : (
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-admin-text-secondary">
                                <th className="px-3 py-2">ID</th>
                                <th className="px-3 py-2">Имя</th>
                                <th className="px-3 py-2">Телефон</th>
                                <th className="px-3 py-2">Email</th>
                                <th className="px-3 py-2">Статус</th>
                                <th className="px-3 py-2">Скидочная карта</th>
                                <th className="px-3 py-2 text-right">Действия</th>
                            </tr>
                        </thead>

                        <tbody className="align-middle">
                            {clients.map((client) => {
                                const state = resolveClientState(client);
                                return (
                                    <tr key={client.id} className="border-b last:border-b-0">
                                        <td className="px-3 py-2 tabular-nums">{client.id}</td>
                                        <td className="px-3 py-2">{client.name || "—"}</td>
                                        <td className="px-3 py-2">{client.phone || "—"}</td>
                                        <td className="max-w-[240px] truncate px-3 py-2" title={client.email || "—"}>{client.email || "—"}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${state.className}`}>
                                                    {state.label}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                                    onClick={() => void handleOpenOrdersHistory(client)}
                                                >
                                                    Выполнено: {Number(client.orders_count ?? 0)}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="max-w-[260px] px-3 py-2">
                                            {client.discount_cards && client.discount_cards.length > 0
                                                ? client.discount_cards.map((card) => `${card.number} (${card.discount_percent}%)`).join(", ")
                                                : "—"}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Link
                                                    href={`/admin/clients/${client.id}/edit`}
                                                    title="Редактировать"
                                                    aria-label="Редактировать"
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border bg-white text-admin-text transition hover:bg-admin-muted"
                                                >
                                                    <Pencil className="h-4 w-4" aria-hidden />
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteClient(client.id)}
                                                    disabled={deletingClientId === client.id}
                                                    title="Удалить"
                                                    aria-label="Удалить"
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                                                >
                                                    {deletingClientId === client.id ? (
                                                        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" aria-hidden />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </AdminTableShell>

            {toast && (
                <AdminFeedbackMessage
                    type={toast.type}
                    message={toast.message}
                    onCloseAction={() => setToast(null)}
                />
            )}

            {historyClient && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <h3 className="text-sm font-semibold text-admin-text">История заказов</h3>
                                <p className="text-xs text-admin-text-secondary">
                                    {historyClient.name || "Клиент"} · {historyClient.phone || "—"}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setHistoryClient(null)}
                                className="rounded-lg border border-admin-border px-2.5 py-1.5 text-xs text-admin-text hover:bg-admin-muted"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-auto p-4">
                            {historyLoading ? (
                                <AdminLoadingState text="Загрузка истории заказов..." />
                            ) : historyRows.length === 0 ? (
                                <AdminEmptyState title="Заказов не найдено" description="Для этого клиента нет заказов по ID или номеру." />
                            ) : (
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-admin-text-secondary">
                                            <th className="px-3 py-2">№ заказа</th>
                                            <th className="px-3 py-2">Дата</th>
                                            <th className="px-3 py-2 text-right">Кол-во</th>
                                            <th className="px-3 py-2 text-right">Сумма</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyRows.map((row) => (
                                            <tr key={row.id} className="border-b last:border-b-0">
                                                <td className="px-3 py-2 font-medium text-admin-text">#{row.id}</td>
                                                <td className="px-3 py-2">{formatDateTime(row.created_at)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{row.items_qty}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{row.total}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AdminPageCard>
    );
}
