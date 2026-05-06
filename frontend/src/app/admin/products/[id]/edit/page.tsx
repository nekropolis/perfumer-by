"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ProductForm, {
    type ProductFormState,
} from "@/components/admin/products/product-form";
import ProductEditorTabs, {
    type ProductEditorTab,
} from "@/components/admin/products/product-editor-tabs";
import ProductAttributeValuesEditor from "@/components/admin/products/product-attribute-values-editor";
import {
    fetchProductBrandOptions,
    fetchProductById,
    rewriteProductDescription,
    updateProduct,
    type ProductAdminDetail,
    type ProductBrandOption,
} from "@/lib/admin-products-api";
import {
    fetchAttributeBindingOptions,
    type AttributeBindingItem,
} from "@/lib/admin-attributes-api";
import ProductVariantsEditor from "@/components/admin/products/product-variant-editor";
import ProductImagesEditor from "@/components/admin/products/product-images-editor";

export default function AdminProductEditPage() {
    const params = useParams<{ id: string }>();

    const [activeTab, setActiveTab] = useState<ProductEditorTab>("main");
    const [form, setForm] = useState<ProductFormState | null>(null);
    const [productData, setProductData] = useState<ProductAdminDetail | null>(null);
    const [brands, setBrands] = useState<ProductBrandOption[]>([]);
    const [attributeBindingOptions, setAttributeBindingOptions] = useState<AttributeBindingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [descriptionRewriting, setDescriptionRewriting] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            setSuccessMessage("");
            const [productResponse, brandsResponse, bindingOptionsResponse] = await Promise.all([
                fetchProductById(params.id),
                fetchProductBrandOptions(),
                fetchAttributeBindingOptions(),
            ]);

            const item = productResponse.data;

            setProductData(item);
            setBrands(brandsResponse.data || []);
            setAttributeBindingOptions(bindingOptionsResponse.data || []);

            setForm({
                id: item.id,
                brand_id: item.brand?.id ? String(item.brand.id) : "",
                name: item.name,
                slug: item.slug,
                is_active: Boolean(item.is_active),
                is_new: Boolean(item.is_new),
                is_hit: Boolean(item.is_hit),
                h1: item.h1 || item.name,
                short_description: item.short_description || "",
                description: item.description || "",
                seo_title: item.seo_title || "",
                seo_description: item.seo_description || "",
                seo_keyword: item.seo_keyword || "",
            });
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка загрузки продукта"
            );
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleSubmit = async () => {
        if (!form) {
            return;
        }

        setSubmitting(true);
        setError("");

        if (!form.brand_id || !form.name.trim() || !form.slug.trim()) {
            setError("Бренд, название и slug обязательны");
            setSubmitting(false);
            return;
        }

        try {
            await updateProduct(form.id!, {
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

            await loadData();
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка сохранения продукта"
            );
        } finally {
            setSubmitting(false);
        }
    };

    const handleRewriteDescription = async () => {
        if (!form?.id) {
            return;
        }
        setError("");
        setSuccessMessage("");
        setDescriptionRewriting(true);
        try {
            const res = await rewriteProductDescription(form.id);
            const nextDescription = res.data?.description;
            if (typeof nextDescription === "string") {
                setForm((prev) => (prev ? { ...prev, description: nextDescription } : prev));
                setProductData((prev) =>
                    prev
                        ? {
                              ...prev,
                              description: nextDescription,
                              description_rewritten_at: res.data?.description_rewritten_at ?? prev.description_rewritten_at,
                          }
                        : prev,
                );
            }
            setSuccessMessage(res.message || "Описание обновлено");
            await loadData();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка уникализации описания");
        } finally {
            setDescriptionRewriting(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Продукты", href: "/admin/products" },
                    { label: "Редактирование" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Редактировать продукт - {productData?.name}</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Редактирование продукта
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

            {successMessage ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="success"
                        message={successMessage}
                        onCloseAction={() => setSuccessMessage("")}
                    />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка продукта..." />
            ) : form && productData ? (
                <>
                    <ProductEditorTabs
                        activeTab={activeTab}
                        onChangeAction={setActiveTab}
                    />

                    {activeTab === "main" && (
                        <ProductForm
                            form={form}
                            brands={brands}
                            submitting={submitting}
                            onChangeAction={setForm}
                            onSubmitAction={handleSubmit}
                            isLegacyForImport={Boolean(productData.is_legacy_for_import)}
                            importRetryPendingTasks={productData.import_retry_pending_tasks}
                            descriptionRewrittenAt={productData.description_rewritten_at ?? null}
                            descriptionRewriting={descriptionRewriting}
                            onRewriteDescriptionAction={handleRewriteDescription}
                        />
                    )}

                    {activeTab === "images" && (
                        <ProductImagesEditor
                            productId={form.id!}
                            images={productData.images || []}
                            onImagesChangedAction={(images) =>
                                setProductData((prev) => (prev ? { ...prev, images } : prev))
                            }
                        />
                    )}

                    {activeTab === "variants" && (
                        <ProductVariantsEditor
                            productId={form.id!}
                            productName={productData.name}
                            items={productData.variants || []}
                            onReloadAction={loadData}
                        />
                    )}

                    {activeTab === "attributes" && (
                        <ProductAttributeValuesEditor
                            productId={form.id!}
                            items={productData.attribute_values || []}
                            attributes={attributeBindingOptions}
                            onReloadAction={loadData}
                        />
                    )}

                    {activeTab === "seo" && (
                        <div className="space-y-4 rounded-2xl border bg-white p-5">
                            <div>
                                <label className="mb-1 block text-sm text-gray-600">
                                    SEO title
                                </label>
                                <input
                                    type="text"
                                    value={form.seo_title}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            seo_title: e.target.value,
                                        })
                                    }
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-gray-600">
                                    SEO description
                                </label>
                                <textarea
                                    value={form.seo_description}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            seo_description: e.target.value,
                                        })
                                    }
                                    className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-gray-600">
                                    SEO keyword
                                </label>
                                <textarea
                                    value={form.seo_keyword}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            seo_keyword: e.target.value,
                                        })
                                    }
                                    className="min-h-[90px] w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                                >
                                    {submitting ? "Сохранение..." : "Сохранить"}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : null}
        </AdminPageCard>
    );
}
