"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import LoyaltyCardForm, { type LoyaltyCardFormState } from "@/components/admin/loyalty/loyalty-card-form";
import LoyaltyCardUserSearchPanel, { LoyaltyUserSelectionChips } from "@/components/admin/loyalty/loyalty-card-user-search-panel";
import { attachUserToLoyaltyCard, createLoyaltyCard } from "@/lib/admin-loyalty-api";
import { fetchAdminUsers, type AdminUser } from "@/lib/admin-users-api";

const emptyForm: LoyaltyCardFormState = {
    number: "",
    discount_percent: "3.00",
    status: "active",
};

export default function AdminLoyaltyCardCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<LoyaltyCardFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [userSearch, setUserSearch] = useState("");
    const [foundUsers, setFoundUsers] = useState<AdminUser[]>([]);
    const [usersToAttach, setUsersToAttach] = useState<AdminUser[]>([]);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.number.trim()) {
            setError("Номер карты обязателен");
            setSubmitting(false);
            return;
        }

        try {
            const created = await createLoyaltyCard({
                card_number: form.number.trim(),
                discount_percent: Number(form.discount_percent),
                status: form.status,
            });

            const cardId = Number(created?.data?.id);
            if (Number.isInteger(cardId) && cardId > 0 && usersToAttach.length > 0) {
                await Promise.all(usersToAttach.map((u) => attachUserToLoyaltyCard(cardId, u.id)));
            }
            router.push("/admin/loyalty/cards");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания карты");
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

    const toggleUserSelection = (user: AdminUser, nextChecked: boolean) => {
        setUsersToAttach((prev) => {
            if (nextChecked) {
                return prev.some((u) => u.id === user.id) ? prev : [...prev, user];
            }
            return prev.filter((u) => u.id !== user.id);
        });
    };

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Накопительные карты", href: "/admin/loyalty/cards" },
                    { label: "Создание" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать накопительную карту</h1>
                    <p className="mt-1 text-sm text-gray-600">Создание новой карты лояльности</p>
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

            <LoyaltyCardForm form={form} submitting={submitting} onChangeAction={setForm} onSubmitAction={handleSubmit} />

            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
                <div className="mb-3 text-base font-semibold">Привязка пользователей</div>
                <p className="mb-3 text-sm text-gray-600">
                    Выберите пользователей до сохранения карты — они будут привязаны сразу после создания.
                </p>
                <LoyaltyUserSelectionChips users={usersToAttach} onRemoveAction={(id) => setUsersToAttach((p) => p.filter((u) => u.id !== id))} />
                <LoyaltyCardUserSearchPanel
                    title="Поиск и выбор"
                    userSearch={userSearch}
                    onUserSearchChangeAction={setUserSearch}
                    onSearchAction={() => void searchUsers()}
                    foundUsers={foundUsers}
                    selectedUserIds={usersToAttach.map((u) => u.id)}
                    onToggleUserAction={toggleUserSelection}
                    alreadyLinkedIds={[]}
                />
            </div>
        </AdminPageCard>
    );
}

