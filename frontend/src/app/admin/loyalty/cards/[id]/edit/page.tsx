"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import LoyaltyCardForm, { type LoyaltyCardFormState } from "@/components/admin/loyalty/loyalty-card-form";
import LoyaltyCardUserSearchPanel, {
    LoyaltyUserSelectionChips,
    formatAdminUserPrimary,
} from "@/components/admin/loyalty/loyalty-card-user-search-panel";
import {
    attachUserToLoyaltyCard,
    detachUserFromLoyaltyCard,
    fetchAdminLoyaltyCard,
    loyaltyCardDisplayNumber,
    updateLoyaltyCard,
} from "@/lib/admin-loyalty-api";
import { fetchAdminUsers, type AdminUser } from "@/lib/admin-users-api";

export default function AdminLoyaltyCardEditPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();

    const [form, setForm] = useState<LoyaltyCardFormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [attachedUsers, setAttachedUsers] = useState<AdminUser[]>([]);
    const [userSearch, setUserSearch] = useState("");
    const [foundUsers, setFoundUsers] = useState<AdminUser[]>([]);
    const [usersToAttach, setUsersToAttach] = useState<AdminUser[]>([]);
    const [detachingUserId, setDetachingUserId] = useState<number | null>(null);

    useEffect(() => {
        const loadItem = async () => {
            setLoading(true);
            setError("");
            try {
                const data = await fetchAdminLoyaltyCard(Number(params.id));
                const item = data.data;
                setForm({
                    id: item.id,
                    number: loyaltyCardDisplayNumber(item),
                    discount_percent: String(item.discount_percent),
                    status: (item.status ?? (item.is_active ? "active" : "blocked")) as LoyaltyCardFormState["status"],
                });
                setAttachedUsers((item.users || []) as AdminUser[]);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки карты");
            } finally {
                setLoading(false);
            }
        };
        void loadItem();
    }, [params.id]);

    const handleSubmit = async () => {
        if (!form?.id) return;
        setSubmitting(true);
        setError("");
        try {
            await updateLoyaltyCard(form.id, {
                discount_percent: Number(form.discount_percent),
                status: form.status,
            });
            router.push("/admin/loyalty/cards");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения карты");
        } finally {
            setSubmitting(false);
        }
    };

    const searchUsers = async () => {
        try {
            const query = userSearch.trim();
            if (query.length < 2) {
                setError("Введите минимум 2 символа для поиска пользователя");
                return;
            }
            const response = await fetchAdminUsers({ search: query });
            setFoundUsers(response.data || []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка поиска пользователей");
        }
    };

    const attachSelectedUsers = async () => {
        if (!form?.id || usersToAttach.length === 0) {
            setError("Выберите хотя бы одного пользователя для привязки");
            return;
        }

        try {
            await Promise.all(usersToAttach.map((u) => attachUserToLoyaltyCard(form.id!, u.id)));
            const refreshed = await fetchAdminLoyaltyCard(form.id);
            setAttachedUsers((refreshed.data.users || []) as AdminUser[]);
            setUsersToAttach([]);
            setFoundUsers([]);
            setUserSearch("");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка привязки пользователей");
        }
    };

    const toggleUserSelection = (user: AdminUser, nextChecked: boolean) => {
        setUsersToAttach((prev) => {
            if (nextChecked) {
                return prev.some((u) => u.id === user.id) ? prev : [...prev, user];
            }
            return prev.filter((u) => u.id !== user.id);
        });
    };

    const detachAttachedUser = async (userId: number) => {
        if (!form?.id) return;
        setDetachingUserId(userId);
        setError("");
        try {
            await detachUserFromLoyaltyCard(form.id, userId);
            const refreshed = await fetchAdminLoyaltyCard(form.id);
            setAttachedUsers((refreshed.data.users || []) as AdminUser[]);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка отвязки пользователя");
        } finally {
            setDetachingUserId(null);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Накопительные карты", href: "/admin/loyalty/cards" },
                    { label: "Редактирование" },
                ]}
            />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать карту {form?.number ? `- ${form.number}` : ""}</h1>
                    <p className="mt-1 text-sm text-gray-600">Редактирование карты лояльности</p>
                </div>
                <Link href="/admin/loyalty/cards" className="rounded-xl border px-4 py-2 text-sm">
                    Назад
                </Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка карты..." />
            ) : form ? (
                <>
                    <LoyaltyCardForm form={form} submitting={submitting} onChangeAction={setForm} onSubmitAction={handleSubmit} />

                    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
                        <div className="mb-3 text-base font-semibold">Привязанные пользователи</div>
                        {attachedUsers.length === 0 ? (
                            <p className="mb-6 text-sm text-gray-600">Пользователи пока не привязаны.</p>
                        ) : (
                            <ul className="mb-6 divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
                                {attachedUsers.map((u) => (
                                    <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                                        <div className="min-w-0">
                                            <div className="font-medium text-gray-900">{formatAdminUserPrimary(u)}</div>
                                            <div className="mt-0.5 text-xs text-gray-500">ID {u.id}</div>
                                        </div>
                                        <button
                                            type="button"
                                            className="shrink-0 rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                                            disabled={detachingUserId === u.id}
                                            onClick={() => void detachAttachedUser(u.id)}
                                        >
                                            {detachingUserId === u.id ? "…" : "Отвязать"}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <LoyaltyUserSelectionChips
                            users={usersToAttach}
                            onRemoveAction={(id) => setUsersToAttach((p) => p.filter((u) => u.id !== id))}
                        />
                        <LoyaltyCardUserSearchPanel
                            userSearch={userSearch}
                            onUserSearchChangeAction={setUserSearch}
                            onSearchAction={() => void searchUsers()}
                            foundUsers={foundUsers}
                            selectedUserIds={usersToAttach.map((u) => u.id)}
                            onToggleUserAction={toggleUserSelection}
                            alreadyLinkedIds={attachedUsers.map((u) => u.id)}
                        />

                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={() => void attachSelectedUsers()}
                                className="rounded-xl border px-4 py-2.5 text-sm"
                                disabled={usersToAttach.length === 0}
                            >
                                Привязать выбранных
                            </button>
                        </div>
                    </div>
                </>
            ) : null}
        </AdminPageCard>
    );
}

