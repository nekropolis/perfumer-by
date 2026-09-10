"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import ClientForm, { isValidClientPhone, isValidOptionalClientPhone, type ClientFormState } from "@/components/admin/clients/client-form";
import { createAdminClient } from "@/lib/admin-clients-api";

const emptyForm: ClientFormState = {
    first_name: "",
    last_name: "",
    patronymic: "",
    birth_date: "",
    phone: "",
    additional_phone: "",
    email: "",
    password: "",
    passwordConfirmation: "",
};

export default function AdminClientsCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<ClientFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
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

        try {
            await createAdminClient({
                first_name: form.first_name.trim() || null,
                last_name: form.last_name.trim() || null,
                patronymic: form.patronymic.trim() || null,
                birth_date: form.birth_date || null,
                phone: form.phone.trim(),
                additional_phone: form.additional_phone.trim() || null,
                email: form.email.trim() || null,
                password: form.password.trim() || null,
            });
            router.push("/admin/clients");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания клиента");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminCrudHeader
                backHref="/admin/clients"
                backAriaLabel="Назад к клиентам"
                title="Создать клиента"
                description="Новый клиент в админской CRUD форме"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Клиенты", href: "/admin/clients" },
                    { label: "Создание" },
                ]}
            />
            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <ClientForm
                form={form}
                submitting={submitting}
                submitLabel="Создать"
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
