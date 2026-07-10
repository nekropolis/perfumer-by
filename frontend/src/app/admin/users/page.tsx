"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import {
    deleteAdminUser,
    fetchAdminUsers,
    updateAdminUserRole,
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
import { AdminToast } from "@/types/admin";

const ROLES = ["admin", "manager", "ceo"] as const;

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
    admin: "Админ",
    manager: "Менеджер",
    ceo: "CEO",
};

function roleLabel(role: string): string {
    return ROLE_LABELS[role as (typeof ROLES)[number]] ?? role;
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
    const [updatingRoleUserId, setUpdatingRoleUserId] = useState<number | null>(null);

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
                setToast({ type: "error", message: "Не удалось загрузить персонал" });
            } finally {
                setLoading(false);
            }
        };

        void loadUsers();
    }, [debouncedSearch, page]);

    const handleDeleteUser = async (userId: number) => {
        if (!window.confirm("Удалить сотрудника? Действие нельзя отменить.")) {
            return;
        }
        setToast(null);
        try {
            setDeletingUserId(userId);
            await deleteAdminUser(userId);
            setUsers((prev) => prev.filter((u) => u.id !== userId));
            setToast({ type: "success", message: "Сотрудник удалён" });
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось удалить сотрудника" });
        } finally {
            setDeletingUserId(null);
        }
    };

    const handleRoleChange = async (userId: number, role: string) => {
        setToast(null);
        try {
            setUpdatingRoleUserId(userId);
            await updateAdminUserRole(userId, role);
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
            setToast({ type: "success", message: "Роль обновлена" });
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось обновить роль" });
        } finally {
            setUpdatingRoleUserId(null);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Персонал"
                description="Управление сотрудниками: профиль, роли и доступ в админку"
                action={(
                    <Link
                        href="/admin/users/create"
                        className="inline-flex items-center justify-center rounded-lg bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover"
                    >
                        Создать сотрудника
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
                    <AdminLoadingState text="Загрузка персонала..." />
                ) : users.length === 0 ? (
                    <AdminEmptyState
                        title="Сотрудники не найдены"
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
                                <th className="px-3 py-2">Роль</th>
                                <th className="px-3 py-2 text-right">Действия</th>
                            </tr>
                        </thead>

                        <tbody className="align-middle">
                            {users.map((user) => (
                                <tr key={user.id} className="border-b last:border-b-0">
                                    <td className="px-3 py-2 tabular-nums">{user.id}</td>
                                    <td className="px-3 py-2">{user.name || "—"}</td>
                                    <td className="px-3 py-2">{user.phone || "—"}</td>
                                    <td className="max-w-[240px] truncate px-3 py-2" title={user.email || "—"}>{user.email || "—"}</td>
                                    <td className="px-3 py-2">
                                        <select
                                            value={ROLES.includes(user.role as (typeof ROLES)[number]) ? user.role : "manager"}
                                            onChange={(e) => void handleRoleChange(user.id, e.target.value)}
                                            disabled={updatingRoleUserId === user.id}
                                            className="min-w-[9rem] rounded-lg border border-admin-border bg-white px-2 py-1 text-xs disabled:opacity-60"
                                            aria-label={`Роль сотрудника ${user.name || user.id}`}
                                        >
                                            {ROLES.map((role) => (
                                                <option key={role} value={role}>
                                                    {roleLabel(role)}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link
                                                href={`/admin/users/${user.id}/edit`}
                                                title="Редактировать"
                                                aria-label="Редактировать"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border bg-white text-admin-text transition hover:bg-admin-muted"
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
                            ))}
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
        </AdminPageCard>
    );
}
