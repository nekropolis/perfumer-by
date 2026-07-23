"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AdminPageForm, { type AdminPageFormState } from "@/components/admin/pages/page-form";
import AdminPageEditorTabs, { type AdminPageEditorTab } from "@/components/admin/pages/page-editor-tabs";
import { fetchAdminPageById, updateAdminPage } from "@/lib/admin-pages-api";

export default function AdminPageEditPage() {
    const params = useParams<{ id: string }>();
    const [form, setForm] = useState<AdminPageFormState | null>(null);
    const [activeTab, setActiveTab] = useState<AdminPageEditorTab>("main");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetchAdminPageById(params.id);
            const item = response.data;
            setForm({
                id: item.id,
                is_active: Boolean(item.is_active),
                name: item.name,
                slug: item.slug,
                h1: item.h1 || item.name,
                content: item.content || "",
                seo_title: item.seo_title || "",
                seo_description: item.seo_description || "",
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки страницы");
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleSubmit = async () => {
        if (!form) return;
        setSubmitting(true);
        setError("");
        if (!form.name.trim() || !form.slug.trim()) {
            setError("Название и slug обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await updateAdminPage(form.id!, form);
            await loadData();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения страницы");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs className="mb-4" items={[{ label: "Админка", href: "/admin" }, { label: "Страницы", href: "/admin/pages" }, { label: "Редактирование" }]} />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать страницу</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">Обновление контента и SEO</p>
                </div>
                <Link href="/admin/pages" className="rounded-lg border px-4 py-2 text-sm">Назад</Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading || !form ? (
                <AdminLoadingState text="Загрузка страницы..." />
            ) : (
                <>
                    <AdminPageEditorTabs activeTab={activeTab} onChangeAction={setActiveTab} />
                    <AdminPageForm
                        form={form}
                        activeTab={activeTab}
                        submitting={submitting}
                        onChangeAction={setForm}
                        onSubmitAction={handleSubmit}
                    />
                </>
            )}
        </AdminPageCard>
    );
}
