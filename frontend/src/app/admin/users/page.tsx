"use client";

import { useEffect, useState } from "react";
import {
    fetchAdminUsers,
    updateAdminUserRole,
    type AdminUser,
} from "@/lib/admin-users-api";
import { getRoleLabel } from "@/constants/admin-roles";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import useDebouncedValue from "@/hooks/use-debounced-value";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import {AdminToast} from "@/types/admin";

const ROLES = ["customer", "admin", "manager", "ceo"];

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [savingUserId, setSavingUserId] = useState<number | null>(null);

    const [toast, setToast] = useState<AdminToast | null>(null);

    const debouncedSearch = useDebouncedValue(search, 400);

    useEffect(() => {
        const loadUsers = async () => {
            setLoading(true);
            setToast(null);

            try {
                const response = await fetchAdminUsers(debouncedSearch);
                setUsers(response.data);
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить пользователей" });
            } finally {
                setLoading(false);
            }
        };

        void loadUsers();
    }, [debouncedSearch]);

    const handleRoleChange = async (userId: number, role: string) => {
        setToast(null);

        try {
            setSavingUserId(userId);

            await updateAdminUserRole(userId, role);

            setUsers((prev) =>
                prev.map((user) =>
                    user.id === userId ? { ...user, role } : user
                )
            );

            setToast({ type: "success", message: "Роль обновлена" });
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось обновить роль" });
        } finally {
            setSavingUserId(null);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Пользователи"
                description="Поиск и управление ролями пользователей"
            >
                <AdminSearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Имя, телефон, email"
                />
            </AdminTableToolbar>

            {loading && <AdminLoadingState text="Загрузка пользователей..." />}

            {!loading && users.length === 0 && (
                <AdminEmptyState
                    title="Пользователи не найдены"
                    description="Попробуйте изменить поисковый запрос."
                />
            )}

            {!loading && users.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                        <tr className="border-b text-left text-gray-500">
                            <th className="px-4 py-4">ID</th>
                            <th className="px-4 py-4">Имя</th>
                            <th className="px-4 py-4">Телефон</th>
                            <th className="px-4 py-4">Email</th>
                            <th className="px-4 py-4">Роль</th>
                        </tr>
                        </thead>

                        <tbody className="align-middle">
                        {users.map((user) => (
                            <tr key={user.id} className="border-b last:border-b-0">
                                <td className="px-4 py-4">{user.id}</td>
                                <td className="px-4 py-4">{user.name || "—"}</td>
                                <td className="px-4 py-4">{user.phone || "—"}</td>
                                <td className="px-4 py-4">{user.email || "—"}</td>
                                <td className="px-4 py-4">
                                    <select
                                        value={user.role}
                                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                        disabled={savingUserId === user.id}
                                        className="min-w-[180px] rounded-xl border px-3 py-2 text-sm focus:outline-none"
                                    >
                                        {ROLES.map((role) => (
                                            <option key={role} value={role}>
                                                {getRoleLabel(role)}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

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