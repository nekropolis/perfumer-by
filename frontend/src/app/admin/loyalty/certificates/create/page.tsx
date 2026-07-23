"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import GiftCertificateForm, { type GiftCertificateFormState } from "@/components/admin/loyalty/gift-certificate-form";
import { createGiftCertificate, fetchGiftCertificateTemplates, type GiftCertificateTemplateItem } from "@/lib/admin-loyalty-api";

const emptyForm: GiftCertificateFormState = {
    code: "",
    template_id: "",
    initial_amount: "",
    balance_amount: "",
    status: "active",
    source: "manual",
    expires_at: "",
    issued_to_user_id: "",
    issued_phone: "",
    comment: "",
};

export default function AdminGiftCertificateCreatePage() {
    const router = useRouter();
    const [form, setForm] = useState<GiftCertificateFormState>(emptyForm);
    const [templates, setTemplates] = useState<GiftCertificateTemplateItem[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        void fetchGiftCertificateTemplates()
            .then((res) => setTemplates(res.data))
            .catch(() => setTemplates([]));
    }, []);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.initial_amount.trim() && !form.template_id) {
            setError("Укажите номинал или выберите шаблон");
            setSubmitting(false);
            return;
        }

        if (!form.code.trim()) {
            setError("Укажите код сертификата");
            setSubmitting(false);
            return;
        }

        try {
            await createGiftCertificate({
                code: form.code.trim(),
                template_id: form.template_id ? Number(form.template_id) : undefined,
                initial_amount: form.initial_amount.trim() ? Number(form.initial_amount) : undefined,
                source: form.source?.trim() || "manual",
                expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
                issued_to_user_id: form.issued_to_user_id?.trim()
                    ? Number.parseInt(form.issued_to_user_id.trim(), 10)
                    : undefined,
                issued_phone: form.issued_phone?.trim() || undefined,
                comment: form.comment?.trim() || undefined,
            });
            router.push("/admin/loyalty/certificates");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания сертификата");
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
                    { label: "Создание" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать сертификат</h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">Создание нового подарочного сертификата</p>
                </div>
                <Link href="/admin/loyalty/certificates" className="rounded-lg border px-4 py-2 text-sm">
                    Назад
                </Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <GiftCertificateForm
                form={form}
                templateOptions={templates}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
