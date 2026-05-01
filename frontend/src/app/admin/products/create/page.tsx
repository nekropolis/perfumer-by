"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ProductForm, {
    type ProductFormState,
} from "@/components/admin/products/product-form";
import {
    createProduct,
    fetchProductBrandOptions,
    type ProductBrandOption,
} from "@/lib/admin-products-api";

const emptyForm: ProductFormState = {
    brand_id: "",
    name: "",
    slug: "",
    is_active: true,
    is_new: false,
    is_hit: false,
    h1: "",
    short_description: "",
    description: "",
    seo_title: "",
    seo_description: "",
    seo_keyword: "",
};

export default function AdminProductCreatePage() {
    const router = useRouter();

    const [form, setForm] = useState<ProductFormState>(emptyForm);
    const [brands, setBrands] = useState<ProductBrandOption[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadBrands = async () => {
            try {
                const data = await fetchProductBrandOptions();
                setBrands(data.data || []);
            } catch (e: unknown) {
                setError(
                    e instanceof Error
                        ? e.message : "Ошибка загрузки брендов");
            }
        };

        void loadBrands();
    }, []);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");

        if (!form.brand_id || !form.name.trim() || !form.slug.trim()) {
            setError("Бренд, название и slug обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await createProduct({
                brand_id: Number(form.brand_id),
                name: form.name,
                slug: form.slug,
                is_active: form.is_active,
                is_new: form.is_new,
                is_hit: form.is_hit,
                h1: form.h1,
                short_description: form.short_description,
                description: form.description,
                seo_title: form.seo_title,
                seo_description: form.seo_description,
                seo_keyword: form.seo_keyword,
            });

            router.push("/admin/products");
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка создания продукта");
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
                    { label: "Продукты", href: "/admin/products" },
                    { label: "Создание" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Создать продукт</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Создание нового продукта
                    </p>
                </div>

                <Link
                    href="/admin/products"
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

            <ProductForm
                form={form}
                brands={brands}
                submitting={submitting}
                onChangeAction={setForm}
                onSubmitAction={handleSubmit}
            />
        </AdminPageCard>
    );
}
