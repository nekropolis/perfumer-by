"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import UserForm, { type UserFormState } from "@/components/admin/users/user-form";
import { createAdminUser } from "@/lib/admin-users-api";

const emptyForm: UserFormState = {
    name: "",
    phone: "",
    email: "",
    role: "customer",
    password: "",
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

        try {
            await createAdminUser({
                name: form.name.trim(),
                phone: form.phone.trim() || null,
                email: form.email.trim() || null,
                role: "customer",
                password: form.password.trim() || null,
            });
            router.push("/admin/users");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания пользователя");
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
                    { label: "Пользователи", href: "/admin/users" },
                    { label: "Создание" },
                ]}
            />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать пользователя</h1>
                    <p className="mt-1 text-sm text-gray-600">Новый пользователь в админской CRUD форме</p>
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

            <UserForm
                form={form}
                submitting={submitting}
                submitLabel="Создать"
                showRole={false}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}

