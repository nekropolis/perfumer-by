"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AdminBlockForm, { type AdminBlockFormState } from "@/components/admin/blocks/block-form";
import { createAdminBlock } from "@/lib/admin-blocks-api";

const emptyForm: AdminBlockFormState = {
    is_active: true,
    name: "",
    code: "",
    content: "",
};

export default function AdminBlockCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<AdminBlockFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.name.trim() || !form.code.trim()) {
            setError("Название и код обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await createAdminBlock(form);
            router.push("/admin/blocks");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания блока");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs className="mb-4" items={[{ label: "Админка", href: "/admin" }, { label: "Блоки", href: "/admin/blocks" }, { label: "Создание" }]} />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать блок</h1>
                    <p className="mt-1 text-sm text-gray-600">Переиспользуемый блок для встраивания в страницы</p>
                </div>
                <Link href="/admin/blocks" className="rounded-xl border px-4 py-2 text-sm">Назад</Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <AdminBlockForm
                form={form}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
