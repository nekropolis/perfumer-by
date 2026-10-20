"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminPageEditorTabs, { type AdminPageEditorTab } from "@/components/admin/pages/page-editor-tabs";
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";
import AdminCatalogLandingForm, {
    type AdminCatalogLandingFormState,
    filtersRecordToJson,
    parseFiltersJson,
} from "@/components/admin/catalog-landings/catalog-landing-form";
import { fetchAdminCatalogLandingById, updateAdminCatalogLanding } from "@/lib/admin-catalog-landings-api";

export default function AdminCatalogLandingEditPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [form, setForm] = useState<AdminCatalogLandingFormState | null>(null);
    const [activeTab, setActiveTab] = useState<AdminPageEditorTab>("main");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        void (async () => {
            setLoading(true);
            setError("");
            try {
                const res = await fetchAdminCatalogLandingById(params.id);
                const item = res.data;
                setForm({
                    id: item.id,
                    is_active: item.is_active,
                    slug: item.slug,
                    gender: (item.gender as AdminCatalogLandingFormState["gender"]) || "",
                    h1: item.h1,
                    content: item.content || "",
                    seo_title: item.seo_title,
                    seo_description: item.seo_description || "",
                    sort: item.sort ?? 0,
                    filtersJson: filtersRecordToJson(item.filters),
                });
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки");
            } finally {
                setLoading(false);
            }
        })();
    }, [params.id]);

    const handleSubmit = async () => {
        if (!form?.id) return;
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
            await updateAdminCatalogLanding(form.id, {
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
            setError(e instanceof Error ? e.message : "Ошибка сохранения");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <AdminPageCard>
                <AdminLoadingState text="Загрузка…" />
            </AdminPageCard>
        );
    }

    if (!form) {
        return (
            <AdminPageCard>
                <AdminFeedbackMessage
                    type="error"
                    message={error || "Посадочная не найдена"}
                    onCloseAction={() => setError("")}
                />
            </AdminPageCard>
        );
    }

    return (
        <AdminPageCard>
            <ContentCatalogTabs />
            <AdminCrudHeader
                backHref="/admin/catalog-landings"
                backAriaLabel="Назад к посадочным"
                title="Редактировать посадочную"
                description={form.slug}
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Посадочные", href: "/admin/catalog-landings" },
                    { label: "Редактирование" },
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
