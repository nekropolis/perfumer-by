"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPostEditorTabs, { type AdminPostEditorTab } from "@/components/admin/posts/post-editor-tabs";
import AdminPostForm, { type AdminPostFormState } from "@/components/admin/posts/post-form";
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { createAdminPost } from "@/lib/admin-posts-api";

const emptyForm: AdminPostFormState = {
    is_active: true,
    title: "",
    slug: "",
    type: "news",
    cover_image: "",
    excerpt: "",
    content: "",
    seo_title: "",
    seo_description: "",
};

export default function AdminPostCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<AdminPostFormState>(emptyForm);
    const [activeTab, setActiveTab] = useState<AdminPostEditorTab>("main");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.title.trim()) {
            setError("Название обязательно");
            setSubmitting(false);
            return;
        }

        try {
            await createAdminPost(form);
            router.push("/admin/posts");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания публикации");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs className="mb-4" items={[{ label: "Админка", href: "/admin" }, { label: "Новости/Статьи", href: "/admin/posts" }, { label: "Создание" }]} />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать публикацию</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">Новость или статья</p>
                </div>
                <Link href="/admin/posts" className="rounded-lg border px-4 py-2 text-sm">Назад</Link>
            </div>

            <ContentCatalogTabs />

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <AdminPostEditorTabs activeTab={activeTab} onChangeAction={setActiveTab} />
            <AdminPostForm
                form={form}
                activeTab={activeTab}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
