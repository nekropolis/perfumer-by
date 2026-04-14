"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AttributeForm, {
    type AttributeFormState,
} from "@/components/admin/attributes/attribute-form";
import AttributeEditorTabs, {
    type AttributeEditorTab,
} from "@/components/admin/attributes/attribute-editor-tabs";
import AttributeOptionsManager from "@/components/admin/attributes/attribute-options-manager";
import {
    fetchAttributeById,
    updateAttribute,
    type AttributeAdminDetail,
} from "@/lib/admin-attributes-api";

export default function AdminAttributeEditPage() {
    const params = useParams<{ id: string }>();

    const [activeTab, setActiveTab] = useState<AttributeEditorTab>("main");
    const [form, setForm] = useState<AttributeFormState | null>(null);
    const [attributeDetail, setAttributeDetail] = useState<AttributeAdminDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadData = async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetchAttributeById(params.id);
            const item = response.data;

            setAttributeDetail(item);
            setForm({
                id: item.id,
                name: item.name,
                type: item.type,
                sort_order: String(item.sort_order ?? 0),
                is_active: item.is_active,
            });
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка загрузки атрибута");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, [params.id]);

    const handleSubmit = async () => {
        if (!form) {
            return;
        }

        setSubmitting(true);
        setError("");
        setSuccess("");

        if (!form.name.trim()) {
            setError("Название обязательно");
            setSubmitting(false);
            return;
        }

        try {
            const result = await updateAttribute(form.id!, {
                name: form.name,
                type: form.type,
                sort_order: Number(form.sort_order || 0),
                is_active: form.is_active,
            });

            setSuccess(result.message || "Атрибут сохранен");
            await loadData();
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка сохранения атрибута"
            );
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
                    { label: "Атрибуты", href: "/admin/attributes" },
                    { label: "Редактирование" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать атрибут</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Настройка атрибута и его опций
                    </p>
                </div>

                <Link
                    href="/admin/attributes"
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

            {success ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="success"
                        message={success}
                        onCloseAction={() => setSuccess("")}
                    />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка атрибута..." />
            ) : form && attributeDetail ? (
                <>
                    <AttributeEditorTabs
                        activeTab={activeTab}
                        onChangeAction={setActiveTab}
                    />

                    {activeTab === "main" && (
                        <AttributeForm
                            form={form}
                            submitting={submitting}
                            onChangeAction={setForm}
                            onSubmitAction={handleSubmit}
                        />
                    )}

                    {activeTab === "options" && (
                        <AttributeOptionsManager
                            attributeId={form.id!}
                            items={attributeDetail.options || []}
                            disabled={form.type === "text"}
                            onReloadAction={loadData}
                        />
                    )}
                </>
            ) : null}
        </AdminPageCard>
    );
}
