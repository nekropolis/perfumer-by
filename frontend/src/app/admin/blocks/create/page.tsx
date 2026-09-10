"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
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
            <AdminCrudHeader
                backHref="/admin/blocks"
                backAriaLabel="Назад к блокам"
                title="Создать блок"
                description="Переиспользуемый блок для встраивания в страницы"
                items={[{ label: "Админка", href: "/admin" }, { label: "Блоки", href: "/admin/blocks" }, { label: "Создание" }]}
            />

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
