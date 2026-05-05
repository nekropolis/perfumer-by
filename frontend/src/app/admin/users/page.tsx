"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import {
    deleteAdminUser,
    fetchAdminUserOrdersHistory,
    fetchAdminUsers,
    type AdminUserOrderHistoryItem,
    type AdminUser,
} from "@/lib/admin-users-api";
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
import {AdminToast} from "@/types/admin";

const ROLES = ["customer", "admin", "manager", "ceo"];

function resolveUserState(user: AdminUser): { label: string; className: string } {
    const isVerified = Boolean(user.phone_verified_at);
    const ordersCount = Number(user.orders_count ?? 0);

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
        className: "bg-gray-50 text-gray-600 border-gray-200",
    };
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU");
}

export default function AdminUsersPage() {
    const searchParamsFromUrl = useSearchParams();

    const [users, setUsers] = useState<AdminUser[]>([]);
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
    const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
    const [historyUser, setHistoryUser] = useState<AdminUser | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRows, setHistoryRows] = useState<AdminUserOrderHistoryItem[]>([]);

    const debouncedSearch = useDebouncedValue(search, 400);
    useResetPageOnChange(setPage, [debouncedSearch]);

    useEffect(() => {
        const loadUsers = async () => {
            setLoading(true);
            setToast(null);

            try {
                const response = await fetchAdminUsers({ search: debouncedSearch, page });
                setUsers(response.data);
                setMeta(response.meta);
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить пользователей" });
            } finally {
                setLoading(false);
            }
        };

        void loadUsers();
    }, [debouncedSearch, page]);

    const handleDeleteUser = async (userId: number) => {
        if (!window.confirm("Удалить пользователя? Действие нельзя отменить.")) {
            return;
        }
        setToast(null);
        try {
            setDeletingUserId(userId);
            await deleteAdminUser(userId);
            setUsers((prev) => prev.filter((u) => u.id !== userId));
            setToast({ type: "success", message: "Пользователь удалён" });
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось удалить пользователя" });
        } finally {
            setDeletingUserId(null);
        }
    };

    const handleOpenOrdersHistory = async (user: AdminUser) => {
        setHistoryUser(user);
        setHistoryRows([]);
        setHistoryLoading(true);
        try {
            const response = await fetchAdminUserOrdersHistory(user.id);
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
                title="Пользователи"
                description="CRUD пользователей: редактирование профиля, роли и просмотр карты/статуса"
                action={(
                    <Link
                        href="/admin/users/create"
                        className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                    >
                        Создать пользователя
                    </Link>
                )}
            />

            <AdminTableShell
                total={meta?.total ?? users.length}
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
                {loading && users.length === 0 ? (
                    <AdminLoadingState text="Загрузка пользователей..." />
                ) : users.length === 0 ? (
                    <AdminEmptyState
                        title="Пользователи не найдены"
                        description="Попробуйте изменить поисковый запрос."
                    />
                ) : (
                    <table className="min-w-full text-sm">
                        <thead>
                        <tr className="border-b text-left text-gray-500">
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
                        {users.map((user) => {
                            const state = resolveUserState(user);
                            return (
                            <tr key={user.id} className="border-b last:border-b-0">
                                <td className="px-3 py-2 tabular-nums">{user.id}</td>
                                <td className="px-3 py-2">{user.name || "—"}</td>
                                <td className="px-3 py-2">{user.phone || "—"}</td>
                                <td className="max-w-[240px] truncate px-3 py-2" title={user.email || "—"}>{user.email || "—"}</td>
                                <td className="px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${state.className}`}>
                                            {state.label}
                                        </span>
                                        <button
                                            type="button"
                                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                            onClick={() => void handleOpenOrdersHistory(user)}
                                        >
                                            Выполнено: {Number(user.orders_count ?? 0)}
                                        </button>
                                    </div>
                                </td>
                                <td className="max-w-[260px] px-3 py-2">
                                    {user.discount_cards && user.discount_cards.length > 0
                                        ? user.discount_cards.map((card) => `${card.number} (${card.discount_percent}%)`).join(", ")
                                        : "—"}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Link
                                            href={`/admin/users/${user.id}/edit`}
                                            title="Редактировать"
                                            aria-label="Редактировать"
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-800 transition hover:bg-gray-50"
                                        >
                                            <Pencil className="h-4 w-4" aria-hidden />
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteUser(user.id)}
                                            disabled={deletingUserId === user.id}
                                            title="Удалить"
                                            aria-label="Удалить"
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                                        >
                                            {deletingUserId === user.id ? (
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

            {historyUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">История заказов</h3>
                                <p className="text-xs text-gray-500">
                                    {historyUser.name || "Пользователь"} · {historyUser.phone || "—"}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setHistoryUser(null)}
                                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-auto p-4">
                            {historyLoading ? (
                                <AdminLoadingState text="Загрузка истории заказов..." />
                            ) : historyRows.length === 0 ? (
                                <AdminEmptyState title="Заказов не найдено" description="Для этого пользователя нет заказов по ID или номеру." />
                            ) : (
                                <table className="min-w-full text-sm">
                                    <thead>
                                    <tr className="border-b text-left text-gray-500">
                                        <th className="px-3 py-2">№ заказа</th>
                                        <th className="px-3 py-2">Дата</th>
                                        <th className="px-3 py-2 text-right">Кол-во</th>
                                        <th className="px-3 py-2 text-right">Сумма</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {historyRows.map((row) => (
                                        <tr key={row.id} className="border-b last:border-b-0">
                                            <td className="px-3 py-2 font-medium text-gray-900">#{row.id}</td>
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