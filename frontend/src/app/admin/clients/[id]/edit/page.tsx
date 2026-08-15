"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ClientForm, { isValidClientPhone, isValidOptionalClientPhone, type ClientFormState } from "@/components/admin/clients/client-form";
import { fetchAdminClient, updateAdminClient } from "@/lib/admin-clients-api";

export default function AdminClientsEditPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const [form, setForm] = useState<ClientFormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError("");
            try {
                const response = await fetchAdminClient(Number(params.id));
                const client = response.data;
                setForm({
                    first_name: client.first_name ?? "",
                    last_name: client.last_name ?? "",
                    patronymic: client.patronymic ?? "",
                    birth_date: client.birth_date ?? "",
                    phone: client.phone ?? "",
                    additional_phone: client.additional_phone ?? "",
                    email: client.email ?? "",
                    password: "",
                    passwordConfirmation: "",
                });
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки клиента");
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

        if (!isValidClientPhone(form.phone.trim())) {
            setError("Телефон обязателен (BY +375 или международный 8–15 цифр)");
            setSubmitting(false);
            return;
        }
        if (!isValidOptionalClientPhone(form.additional_phone.trim())) {
            setError("Доп. телефон: BY +375 или международный 8–15 цифр, либо пусто");
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
            await updateAdminClient(Number(params.id), {
                first_name: form.first_name.trim() || null,
                last_name: form.last_name.trim() || null,
                patronymic: form.patronymic.trim() || null,
                birth_date: form.birth_date || null,
                phone: form.phone.trim(),
                additional_phone: form.additional_phone.trim() || null,
                email: form.email.trim() || null,
                ...(password !== ""
                    ? { password, password_confirmation: passwordConfirmation }
                    : {}),
            });
            router.push("/admin/clients");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка обновления клиента");
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
                    { label: "Клиенты", href: "/admin/clients" },
                    { label: "Редактирование" },
                ]}
            />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать клиента</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">Изменение полей профиля</p>
                </div>
                <Link href="/admin/clients" className="rounded-lg border px-4 py-2 text-sm">
                    Назад
                </Link>
            </div>
            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка клиента..." />
            ) : form ? (
                <ClientForm
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
