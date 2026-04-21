"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AdminPageForm, { type AdminPageFormState } from "@/components/admin/pages/page-form";
import AdminPageEditorTabs, { type AdminPageEditorTab } from "@/components/admin/pages/page-editor-tabs";
import { createAdminPage } from "@/lib/admin-pages-api";

const emptyForm: AdminPageFormState = {
    is_active: true,
    name: "",
    slug: "",
    h1: "",
    content: "",
    seo_title: "",
    seo_description: "",
};

export default function AdminPageCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<AdminPageFormState>(emptyForm);
    const [activeTab, setActiveTab] = useState<AdminPageEditorTab>("main");
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
            await createAdminPage(form);
            router.push("/admin/pages");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания страницы");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs className="mb-4" items={[{ label: "Админка", href: "/admin" }, { label: "Страницы", href: "/admin/pages" }, { label: "Создание" }]} />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать страницу</h1>
                    <p className="mt-1 text-sm text-gray-600">Новая CMS-страница для сайта</p>
                </div>
                <Link href="/admin/pages" className="rounded-xl border px-4 py-2 text-sm">Назад</Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <AdminPageEditorTabs activeTab={activeTab} onChangeAction={setActiveTab} />
            <AdminPageForm
                form={form}
                activeTab={activeTab}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
