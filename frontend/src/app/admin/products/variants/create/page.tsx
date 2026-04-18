"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ProductVariantDefinitionForm, {
    type ProductVariantDefinitionFormState,
} from "@/components/admin/products/product-variant-definition-form";
import { createVariantDefinition } from "@/lib/admin-product-variants-api";

const emptyForm: ProductVariantDefinitionFormState = {
    volume_ml: "",
    concentration_code: "",
    concentration_label: "",
    is_tester: false,
};

const VARIANTS_BASE = "/admin/products/variants";

export default function AdminProductVariantCreatePage() {
    const router = useRouter();

    const [form, setForm] = useState<ProductVariantDefinitionFormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.volume_ml || !form.concentration_code.trim() || !form.concentration_label.trim()) {
            setError("Объем, код и описание обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await createVariantDefinition({
                volume_ml: Number(form.volume_ml),
                concentration_code: form.concentration_code.trim(),
                concentration_label: form.concentration_label.trim(),
                is_tester: form.is_tester,
            });

            router.push(VARIANTS_BASE);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка создания варианта");
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
                    { label: "Варианты продукта", href: VARIANTS_BASE },
                    { label: "Создание" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать вариант продукта</h1>
                    <p className="mt-1 text-sm text-gray-600">Создание нового варианта в справочнике</p>
                </div>

                <Link href={VARIANTS_BASE} className="rounded-xl border px-4 py-2 text-sm">
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

            <ProductVariantDefinitionForm
                form={form}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
