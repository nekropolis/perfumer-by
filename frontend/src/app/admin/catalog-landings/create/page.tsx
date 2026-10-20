"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPageEditorTabs, { type AdminPageEditorTab } from "@/components/admin/pages/page-editor-tabs";
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";
import AdminCatalogLandingForm, {
    type AdminCatalogLandingFormState,
    parseFiltersJson,
} from "@/components/admin/catalog-landings/catalog-landing-form";
import { createAdminCatalogLanding } from "@/lib/admin-catalog-landings-api";

const emptyForm: AdminCatalogLandingFormState = {
    is_active: true,
    slug: "",
    gender: "",
    h1: "",
    content: "",
    seo_title: "",
    seo_description: "",
    sort: 0,
    filtersJson: "{}",
};

export default function AdminCatalogLandingCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<AdminCatalogLandingFormState>(emptyForm);
    const [activeTab, setActiveTab] = useState<AdminPageEditorTab>("main");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.h1.trim() || !form.slug.trim() || !form.seo_title.trim()) {
            setError("H1, slug и SEO title обязательны");
            setSubmitting(false);
            return;
        }

        let filters: Record<string, number[]>;
        try {
            filters = parseFiltersJson(form.filtersJson);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Некорректный JSON фильтров");
            setSubmitting(false);
            return;
        }

        try {
            await createAdminCatalogLanding({
                is_active: form.is_active,
                slug: form.slug.trim(),
                gender: form.gender || null,
                h1: form.h1.trim(),
                seo_title: form.seo_title.trim(),
                seo_description: form.seo_description.trim() || null,
                content: form.content || null,
                sort: form.sort,
                filters: Object.keys(filters).length > 0 ? filters : null,
            });
            router.push("/admin/catalog-landings");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <ContentCatalogTabs />
            <AdminCrudHeader
                backHref="/admin/catalog-landings"
                backAriaLabel="Назад к посадочным"
                title="Создать посадочную"
                description="SEO-страница каталога с фильтрами"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Посадочные", href: "/admin/catalog-landings" },
                    { label: "Создание" },
                ]}
            />

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <AdminPageEditorTabs activeTab={activeTab} onChangeAction={setActiveTab} />
            <AdminCatalogLandingForm
                form={form}
                activeTab={activeTab}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
