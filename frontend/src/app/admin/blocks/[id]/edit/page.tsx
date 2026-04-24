"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AdminBlockForm, { type AdminBlockFormState } from "@/components/admin/blocks/block-form";
import { fetchAdminBlockById, updateAdminBlock } from "@/lib/admin-blocks-api";

export default function AdminBlockEditPage() {
    const params = useParams<{ id: string }>();
    const [form, setForm] = useState<AdminBlockFormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetchAdminBlockById(params.id);
            const item = response.data;
            setForm({
                id: item.id,
                is_active: Boolean(item.is_active),
                name: item.name,
                code: item.code,
                content: item.content || "",
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки блока");
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
        if (!form.name.trim() || !form.code.trim()) {
            setError("Название и код обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await updateAdminBlock(form.id!, form);
            await loadData();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения блока");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs className="mb-4" items={[{ label: "Админка", href: "/admin" }, { label: "Блоки", href: "/admin/blocks" }, { label: "Редактирование" }]} />
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать блок</h1>
                    <p className="mt-1 text-sm text-gray-600">Обновление содержимого блока</p>
                </div>
                <Link href="/admin/blocks" className="rounded-xl border px-4 py-2 text-sm">Назад</Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading || !form ? (
                <AdminLoadingState text="Загрузка блока..." />
            ) : (
                <AdminBlockForm
                    form={form}
                    submitting={submitting}
                    onChangeAction={setForm}
                    onSubmitAction={handleSubmit}
                />
            )}
        </AdminPageCard>
    );
}
