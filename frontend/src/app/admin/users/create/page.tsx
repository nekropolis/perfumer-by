"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import UserForm, { type UserFormState } from "@/components/admin/users/user-form";
import { createAdminUser } from "@/lib/admin-users-api";

const emptyForm: UserFormState = {
    name: "",
    phone: "",
    email: "",
    role: "manager",
    password: "",
    passwordConfirmation: "",
};

export default function AdminUsersCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<UserFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.name.trim()) {
            setError("Имя обязательно");
            setSubmitting(false);
            return;
        }

        if (!form.email.trim()) {
            setError("Email обязателен");
            setSubmitting(false);
            return;
        }

        try {
            await createAdminUser({
                name: form.name.trim(),
                phone: form.phone.trim() || null,
                email: form.email.trim(),
                role: form.role,
                password: form.password.trim() || null,
            });
            router.push("/admin/users");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания сотрудника");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminCrudHeader
                backHref="/admin/users"
                backAriaLabel="Назад к персоналу"
                title="Создать сотрудника"
                description="Новый сотрудник с доступом в админку"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Персонал", href: "/admin/users" },
                    { label: "Создание" },
                ]}
            />
            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <UserForm
                form={form}
                submitting={submitting}
                submitLabel="Создать"
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
