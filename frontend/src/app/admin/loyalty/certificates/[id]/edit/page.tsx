"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import GiftCertificateForm, { type GiftCertificateFormState } from "@/components/admin/loyalty/gift-certificate-form";
import { fetchAdminGiftCertificate, updateGiftCertificate } from "@/lib/admin-loyalty-api";

function toDatetimeLocal(iso: string | null | undefined): string {
    if (!iso) return "";
    return iso.slice(0, 16);
}

export default function AdminGiftCertificateEditPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();

    const [form, setForm] = useState<GiftCertificateFormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadItem = async () => {
            setLoading(true);
            setError("");
            try {
                const data = await fetchAdminGiftCertificate(Number(params.id));
                const item = data.data;
                setForm({
                    id: item.id,
                    code: item.code ?? "",
                    template_id: item.template_id != null ? String(item.template_id) : "",
                    initial_amount: String(item.initial_amount),
                    balance_amount: String(item.balance_amount),
                    reserved_amount: String(item.reserved_amount),
                    status: item.status,
                    source: item.source ?? "manual",
                    expires_at: toDatetimeLocal(item.expires_at),
                    issued_to_user_id: item.issued_to_user_id != null ? String(item.issued_to_user_id) : "",
                    issued_phone: item.issued_phone ?? "",
                    comment: item.comment ?? "",
                });
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки сертификата");
            } finally {
                setLoading(false);
            }
        };
        void loadItem();
    }, [params.id]);

    const handleSubmit = async () => {
        if (!form?.id) return;
        setSubmitting(true);
        setError("");
        try {
            await updateGiftCertificate(form.id, {
                code: form.code.trim() === "" ? null : form.code.trim(),
                template_id: form.template_id ? Number(form.template_id) : undefined,
                balance_amount: Number(form.balance_amount),
                status: form.status,
                source: form.source?.trim() || "manual",
                expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
                issued_to_user_id: form.issued_to_user_id?.trim()
                    ? Number.parseInt(form.issued_to_user_id.trim(), 10)
                    : null,
                issued_phone: form.issued_phone?.trim() || null,
                comment: form.comment?.trim() || null,
            });
            router.push("/admin/loyalty/certificates");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения сертификата");
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
                    { label: "Сертификаты", href: "/admin/loyalty/certificates" },
                    { label: "Редактирование" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Редактировать сертификат
                        {form?.code?.trim() ? ` — ${form.code}` : form?.id ? ` #${form.id}` : ""}
                    </h1>
                    <p className="mt-1 text-sm text-gray-600">Редактирование сертификата</p>
                </div>
                <Link href="/admin/loyalty/certificates" className="rounded-xl border px-4 py-2 text-sm">
                    Назад
                </Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка сертификата..." />
            ) : form ? (
                <GiftCertificateForm form={form} submitting={submitting} onChangeAction={setForm} onSubmitAction={handleSubmit} />
            ) : null}
        </AdminPageCard>
    );
}
