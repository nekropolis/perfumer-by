"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import LoyaltyCardForm, {
    type LoyaltyCardFormState,
    validateLoyaltyCardDiscountPercent,
} from "@/components/admin/loyalty/loyalty-card-form";
import LoyaltyCardUserSearchPanel, { LoyaltyUserSelectionChips } from "@/components/admin/loyalty/loyalty-card-user-search-panel";
import { attachUserToLoyaltyCard, createLoyaltyCard } from "@/lib/admin-loyalty-api";
import { fetchAdminClients, type AdminClient } from "@/lib/admin-clients-api";

const emptyForm: LoyaltyCardFormState = {
    number: "",
    discount_percent: "3.00",
    is_manual_discount: false,
    status: "active",
};

export default function AdminLoyaltyCardCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<LoyaltyCardFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [userSearch, setUserSearch] = useState("");
    const [foundUsers, setFoundUsers] = useState<AdminClient[]>([]);
    const [usersToAttach, setUsersToAttach] = useState<AdminClient[]>([]);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.number.trim()) {
            setError("Номер карты обязателен");
            setSubmitting(false);
            return;
        }

        const discountError = validateLoyaltyCardDiscountPercent(
            form.discount_percent,
            form.is_manual_discount,
        );
        if (discountError) {
            setError(discountError);
            setSubmitting(false);
            return;
        }

        try {
            const created = await createLoyaltyCard({
                card_number: form.number.trim(),
                discount_percent: Number(form.discount_percent),
                is_manual_discount: form.is_manual_discount,
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
            const response = await fetchAdminClients({ search: query });
            setFoundUsers(response.data || []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка поиска клиентов");
        }
    };

    const toggleUserSelection = (user: AdminClient, nextChecked: boolean) => {
        setUsersToAttach((prev) => {
            if (nextChecked) {
                return prev.some((u) => u.id === user.id) ? prev : [...prev, user];
            }
            return prev.filter((u) => u.id !== user.id);
        });
    };

    return (
        <AdminPageCard>
            <AdminCrudHeader
                backHref="/admin/loyalty/cards"
                backAriaLabel="Назад к картам"
                title="Создать накопительную карту"
                description="Создание новой карты лояльности"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Накопительные карты", href: "/admin/loyalty/cards" },
                    { label: "Создание" },
                ]}
            />

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <LoyaltyCardForm form={form} submitting={submitting} onChangeAction={setForm} onSubmitAction={handleSubmit} />

            <div className="mt-6 rounded-2xl border border-admin-border bg-white p-5">
                <div className="mb-3 text-base font-semibold">Привязка пользователей</div>
                <p className="mb-3 text-sm text-admin-text-secondary">
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

