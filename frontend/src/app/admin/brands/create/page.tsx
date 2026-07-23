"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
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
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Бренды", href: "/admin/brands" },
                    { label: "Создание" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать бренд</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">
                        Создание нового бренда
                    </p>
                </div>

                <Link
                    href="/admin/brands"
                    className="rounded-lg border px-4 py-2 text-sm"
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
