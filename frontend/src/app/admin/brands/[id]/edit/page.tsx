"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import BrandForm, { type BrandFormState } from "@/components/admin/brands/brand-form";
import BrandEditorTabs, { type BrandEditorTab } from "@/components/admin/brands/brand-editor-tabs";
import { fetchBrand, updateBrand } from "@/lib/admin-brands-api";

export default function AdminBrandEditPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();

    const [activeTab, setActiveTab] = useState<BrandEditorTab>("main");
    const [form, setForm] = useState<BrandFormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadBrand = async () => {
            setLoading(true);
            setError("");

            try {
                const data = await fetchBrand(Number(params.id));
                const item = data.data;

                setForm({
                    id: item.id,
                    name: item.name,
                    slug: item.slug,
                    description: item.description || "",
                    seo_title: item.seo_title || item.name,
                    seo_description: item.seo_description || "",
                    seo_keyword: item.seo_keyword || "",
                    is_active: item.is_active,
                });
            } catch (e: unknown) {
                setError(
                    e instanceof Error
                        ? e.message : "Ошибка загрузки бренда");
            } finally {
                setLoading(false);
            }
        };

        void loadBrand();
    }, [params.id]);

    const handleSubmit = async () => {
        if (!form) {
            return;
        }

        setSubmitting(true);
        setError("");

        if (!form.name.trim() || !form.slug.trim()) {
            setError("Название и slug обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await updateBrand(form.id!, {
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
                    ? e.message : "Ошибка сохранения бренда");
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
                    { label: "Редактирование" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать бренд - {form?.name}</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Редактирование бренда
                    </p>
                </div>

                <Link
                    href="/admin/brands"
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

            {loading ? (
                <AdminLoadingState text="Загрузка бренда..." />
            ) : form ? (
                <>
                    <BrandEditorTabs activeTab={activeTab} onChangeAction={setActiveTab} />
                    <BrandForm
                        form={form}
                        activeTab={activeTab}
                        submitting={submitting}
                        onChangeAction={setForm}
                        onSubmitAction={handleSubmit}
                    />
                </>
            ) : null}
        </AdminPageCard>
    );
}
