"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import BrandForm, { type BrandFormState } from "@/components/admin/brands/brand-form";
import { createBrand } from "@/lib/admin-brands-api";
const emptyForm: BrandFormState = {
    name: "",
    slug: "",
    is_active: true,
};

export default function AdminBrandCreatePage() {
    const router = useRouter();

    const [form, setForm] = useState<BrandFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.name.trim() || !form.slug.trim()) {
            setError("Название и slug обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await createBrand({
                name: form.name,
                slug: form.slug,
                is_active: form.is_active,
            });

            router.push("/admin/brands");
        } catch (e: any) {
            setError(e?.message || "Ошибка создания бренда");
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
                    { label: "Создание" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать бренд</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Создание нового бренда
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

            <BrandForm
                form={form}
                submitting={submitting}
                onChange={setForm}
                onSubmit={handleSubmit}
            />
        </AdminPageCard>
    );
}
