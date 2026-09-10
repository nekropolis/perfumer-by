"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPostEditorTabs, { type AdminPostEditorTab } from "@/components/admin/posts/post-editor-tabs";
import AdminPostForm, { type AdminPostFormState } from "@/components/admin/posts/post-form";
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
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
            <AdminCrudHeader
                backHref="/admin/posts"
                backAriaLabel="Назад к публикациям"
                title="Создать публикацию"
                description="Новость или статья"
                items={[{ label: "Админка", href: "/admin" }, { label: "Новости/Статьи", href: "/admin/posts" }, { label: "Создание" }]}
            />

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
