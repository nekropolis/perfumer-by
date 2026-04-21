"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AttributeForm, {
    type AttributeFormState,
} from "@/components/admin/attributes/attribute-form";
import { createAttribute } from "@/lib/admin-attributes-api";

const emptyForm: AttributeFormState = {
    name: "",
    type: "text",
    sort_order: "0",
    is_active: true,
    is_filterable: false,
    filter_sort_order: "0",
};

export default function AdminAttributeCreatePage() {
    const router = useRouter();

    const [form, setForm] = useState<AttributeFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.name.trim()) {
            setError("Название обязательно");
            setSubmitting(false);
            return;
        }

        try {
            await createAttribute({
                name: form.name,
                type: form.type,
                sort_order: Number(form.sort_order || 0),
                is_active: form.is_active,
                is_filterable: form.is_filterable,
                filter_sort_order: Number(form.filter_sort_order || 0),
            });

            router.push("/admin/attributes");
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка создания атрибута"
            );
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
                    { label: "Атрибуты", href: "/admin/attributes" },
                    { label: "Создание" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать атрибут</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Новый атрибут каталога
                    </p>
                </div>

                <Link
                    href="/admin/attributes"
                    className="rounded-xl border px-4 py-2 text-sm"
                >
                    Назад
                </Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="error"
                        message={error}
                        onCloseAction={() => setError("")}
                    />
                </div>
            ) : null}

            <AttributeForm
                form={form}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
