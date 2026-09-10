"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import BrandForm, { type BrandFormState } from "@/components/admin/brands/brand-form";
import BrandEditorTabs, { type BrandEditorTab } from "@/components/admin/brands/brand-editor-tabs";
import { createBrand } from "@/lib/admin-brands-api";

const emptyForm: BrandFormState = {
    name: "",
    slug: "",
    description: "",
    seo_title: "",
    seo_description: "",
    seo_keyword: "",
    is_active: true,
};

export default function AdminBrandCreatePage() {
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<BrandEditorTab>("main");
    const [form, setForm] = useState<BrandFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.name.trim() || !form.slug.trim()) {
            setError("Название и slug обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await createBrand({
                name: form.name,
                slug: form.slug,
                description: form.description || null,
                seo_title: form.seo_title || form.name,
                seo_description: form.seo_description || null,
                seo_keyword: form.seo_keyword || null,
                is_active: form.is_active,
            });

            router.push("/admin/brands");
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка создания бренда");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminCrudHeader
                backHref="/admin/brands"
                backAriaLabel="Назад к брендам"
                title="Создать бренд"
                description="Создание нового бренда"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Бренды", href: "/admin/brands" },
                    { label: "Создание" },
                ]}
            />

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="error"
                        message={error}
                        onCloseAction={() => setError("")}
                    />
                </div>
            ) : null}

            <BrandEditorTabs activeTab={activeTab} onChangeAction={setActiveTab} />

            <BrandForm
                form={form}
                activeTab={activeTab}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
