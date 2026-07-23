"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPostEditorTabs, { type AdminPostEditorTab } from "@/components/admin/posts/post-editor-tabs";
import AdminPostForm, { type AdminPostFormState } from "@/components/admin/posts/post-form";
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { fetchAdminPostById, updateAdminPost } from "@/lib/admin-posts-api";

export default function AdminPostEditPage() {
    const params = useParams<{ id: string }>();
    const [form, setForm] = useState<AdminPostFormState | null>(null);
    const [activeTab, setActiveTab] = useState<AdminPostEditorTab>("main");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetchAdminPostById(params.id);
            const item = response.data;
            setForm({
                id: item.id,
                is_active: Boolean(item.is_active),
                title: item.title,
                slug: item.slug ?? "",
                type: item.type,
                cover_image: item.cover_image || "",
                excerpt: item.excerpt || "",
                content: item.content || "",
                seo_title: item.seo_title || "",
                seo_description: item.seo_description || "",
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки публикации");
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
        if (!form.title.trim()) {
            setError("Название обязательно");
            setSubmitting(false);
            return;
        }

        try {
            await updateAdminPost(form.id!, form);
            await loadData();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения публикации");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs className="mb-4" items={[{ label: "Админка", href: "/admin" }, { label: "Новости/Статьи", href: "/admin/posts" }, { label: "Редактирование" }]} />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать публикацию</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">Обновление контента и SEO</p>
                </div>
                <Link href="/admin/posts" className="rounded-lg border px-4 py-2 text-sm">Назад</Link>
            </div>

            <ContentCatalogTabs />

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading || !form ? (
                <AdminLoadingState text="Загрузка публикации..." />
            ) : (
                <>
                    <AdminPostEditorTabs activeTab={activeTab} onChangeAction={setActiveTab} />
                    <AdminPostForm
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
