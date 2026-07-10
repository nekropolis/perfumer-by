"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import UserForm, { type UserFormState } from "@/components/admin/users/user-form";
import { fetchAdminUser, updateAdminUser } from "@/lib/admin-users-api";

export default function AdminUsersEditPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const [form, setForm] = useState<UserFormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError("");
            try {
                const response = await fetchAdminUser(Number(params.id));
                const user = response.data;
                setForm({
                    name: user.name ?? "",
                    phone: user.phone ?? "",
                    email: user.email ?? "",
                    role: user.role,
                    password: "",
                    passwordConfirmation: "",
                });
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки сотрудника");
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [params.id]);

    const handleSubmit = async () => {
        if (!form) return;
        setSubmitting(true);
        setError("");

        if (!form.email.trim()) {
            setError("Email обязателен");
            setSubmitting(false);
            return;
        }

        const password = form.password.trim();
        const passwordConfirmation = form.passwordConfirmation.trim();

        if (password !== "" || passwordConfirmation !== "") {
            if (password.length < 8) {
                setError("Пароль должен быть не короче 8 символов");
                setSubmitting(false);
                return;
            }
            if (password !== passwordConfirmation) {
                setError("Пароли не совпадают");
                setSubmitting(false);
                return;
            }
        }

        try {
            await updateAdminUser(Number(params.id), {
                name: form.name.trim(),
                phone: form.phone.trim() || null,
                email: form.email.trim(),
                role: form.role,
                ...(password !== ""
                    ? { password, password_confirmation: passwordConfirmation }
                    : {}),
            });
            router.push("/admin/users");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка обновления сотрудника");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Персонал", href: "/admin/users" },
                    { label: "Редактирование" },
                ]}
            />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать сотрудника</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">Изменение полей профиля и роли</p>
                </div>
                <Link href="/admin/users" className="rounded-xl border px-4 py-2 text-sm">
                    Назад
                </Link>
            </div>
            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка сотрудника..." />
            ) : form ? (
                <UserForm
                    form={form}
                    submitting={submitting}
                    submitLabel="Сохранить"
                    isEdit
                    onChangeAction={setForm}
                    onSubmitAction={handleSubmit}
                />
            ) : null}
        </AdminPageCard>
    );
}
