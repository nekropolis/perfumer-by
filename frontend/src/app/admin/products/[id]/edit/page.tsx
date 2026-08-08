"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ProductSeoGenerationModal from "@/components/admin/products/product-seo-generation-modal";
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
    fetchProductSeoGeneration,
    fetchProductSeoPreview,
    startProductSeoGeneration,
    updateProduct,
    type ProductAdminDetail,
    type ProductBrandOption,
    type ProductSeoField,
    type ProductSeoFieldState,
    type ProductSeoGeneration,
} from "@/lib/admin-products-api";
import { pollProductSeoGeneration } from "@/lib/product-seo-polling";
import {
    fetchAttributeBindingOptions,
    type AttributeBindingItem,
} from "@/lib/admin-attributes-api";
import ProductVariantsEditor from "@/components/admin/products/product-variant-editor";
import ProductImagesEditor from "@/components/admin/products/product-images-editor";
import {
    buildAutomaticProductMetaTitle,
    buildProductMetaTitle,
    hasManualProductSeoTitle,
} from "@/lib/product-page-seo";
import { productDisplayName } from "@/lib/product-display-name";

const SEO_FIELDS: ProductSeoField[] = [
    "seo_description",
    "short_description",
    "description",
];

function minVariantPrice(product: ProductAdminDetail | null): string | null {
    const prices = (product?.variants ?? [])
        .map((variant) => String(variant.price ?? "").trim())
        .filter(Boolean);
    if (!prices.length) {
        return null;
    }
    return prices.reduce((min, price) =>
        price.localeCompare(min, undefined, { numeric: true }) < 0 ? price : min,
    );
}

export default function AdminProductEditPage() {
    const params = useParams<{ id: string }>();

    const [activeTab, setActiveTab] = useState<ProductEditorTab>("main");
    const [form, setForm] = useState<ProductFormState | null>(null);
    const [productData, setProductData] = useState<ProductAdminDetail | null>(null);
    const [brands, setBrands] = useState<ProductBrandOption[]>([]);
    const [attributeBindingOptions, setAttributeBindingOptions] = useState<AttributeBindingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [seoModalOpen, setSeoModalOpen] = useState(false);
    const [seoStarting, setSeoStarting] = useState(false);
    const [seoPreview, setSeoPreview] = useState<Record<ProductSeoField, ProductSeoFieldState> | null>(null);
    const [seoGeneration, setSeoGeneration] = useState<ProductSeoGeneration | null>(null);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const seoPollController = useRef<AbortController | null>(null);
    const recoveredProductId = useRef<number | null>(null);

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

    const seoTitlePreview = useMemo(() => {
        if (!form) {
            return null;
        }
        const brand =
            brands.find((b) => String(b.id) === String(form.brand_id)) ?? productData?.brand ?? null;
        const display = productDisplayName({ name: form.name, brand });
        const priceMin = minVariantPrice(productData);
        const autoTitle = buildAutomaticProductMetaTitle(display, priceMin);
        const effective = buildProductMetaTitle({
            name: form.name,
            brand,
            seo_title: form.seo_title,
            price_range: { min: priceMin },
        });
        const isManual = hasManualProductSeoTitle(form.seo_title, display);
        return isManual ? `На витрине: ${effective}` : `Авто: ${autoTitle}`;
    }, [brands, form, productData]);

    const handleSubmit = async () => {
        if (!form) {
            return;
        }

        setSubmitting(true);
        setError("");
        setSuccessMessage("");

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
            setSuccessMessage("Продукт успешно сохранён");
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

    const beginSeoPolling = useCallback((productId: number, generationId: number) => {
        seoPollController.current?.abort();
        const controller = new AbortController();
        seoPollController.current = controller;
        window.localStorage.setItem(`product-seo-generation:${productId}`, String(generationId));

        void pollProductSeoGeneration({
            signal: controller.signal,
            fetchStatus: async (signal) => {
                const response = await fetchProductSeoGeneration(productId, generationId, signal);
                return response.data;
            },
            onUpdate: setSeoGeneration,
        })
            .then((terminal) => {
                if (!terminal) {
                    return;
                }
                window.localStorage.removeItem(`product-seo-generation:${productId}`);
                if (terminal.status === "completed" && terminal.result) {
                    setForm((current) => current ? { ...current, ...terminal.result } : current);
                    setProductData((current) => current ? { ...current, ...terminal.result } : current);
                    setSuccessMessage("Поля продукта успешно уникализированы.");
                } else if (terminal.status === "conflicted") {
                    setError(terminal.error || "Товар изменён во время генерации. Результат не применён.");
                } else {
                    setError(terminal.error || "SEO-генерация завершилась с ошибкой.");
                }
            })
            .catch((reason: unknown) => {
                if (!controller.signal.aborted) {
                    setError(reason instanceof Error ? reason.message : "Ошибка проверки SEO-генерации");
                }
            });
    }, []);

    useEffect(() => {
        return () => seoPollController.current?.abort();
    }, []);

    useEffect(() => {
        const productId = productData?.id;
        if (!productId || recoveredProductId.current === productId) {
            return;
        }
        recoveredProductId.current = productId;

        const storedGenerationId = Number(
            window.localStorage.getItem(`product-seo-generation:${productId}`),
        );
        if (storedGenerationId > 0) {
            beginSeoPolling(productId, storedGenerationId);
            return;
        }

        const controller = new AbortController();
        void fetchProductSeoPreview(productId, controller.signal)
            .then((response) => {
                if (response.data.active_generation) {
                    setSeoGeneration(response.data.active_generation);
                    beginSeoPolling(productId, response.data.active_generation.id);
                }
            })
            .catch(() => {
                // Preview will be requested again when the user opens the dialog.
            });

        return () => controller.abort();
    }, [beginSeoPolling, productData?.id]);

    const hasUnsavedGeneratedFields = (): boolean => {
        if (!form || !productData) {
            return false;
        }

        return SEO_FIELDS.some(
            (field) => String(form[field] ?? "") !== String(productData[field] ?? ""),
        );
    };

    const handleOpenSeoGeneration = async () => {
        if (!form?.id || seoGeneration && !["completed", "failed", "conflicted"].includes(seoGeneration.status)) {
            return;
        }
        if (hasUnsavedGeneratedFields()) {
            setError("Сначала сохраните ручные изменения полей продукта.");
            return;
        }

        setError("");
        setSuccessMessage("");
        setSeoStarting(true);
        try {
            const response = await fetchProductSeoPreview(form.id);
            if (response.data.active_generation) {
                setSeoGeneration(response.data.active_generation);
                beginSeoPolling(form.id, response.data.active_generation.id);
                return;
            }
            setSeoPreview(response.data.fields);
            setSeoModalOpen(true);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Ошибка подготовки SEO-генерации");
        } finally {
            setSeoStarting(false);
        }
    };

    const handleStartSeoGeneration = async (
        selectedFields: ProductSeoField[],
        confirmManualChanges: boolean,
    ) => {
        if (!form?.id || !seoPreview) {
            return;
        }

        const fields = Object.fromEntries(
            selectedFields.map((field) => [field, seoPreview[field].current]),
        ) as Partial<Record<ProductSeoField, string | null>>;

        setSeoStarting(true);
        setError("");
        try {
            const response = await startProductSeoGeneration(
                form.id,
                fields,
                confirmManualChanges,
            );
            setSeoGeneration(response.data);
            setSeoModalOpen(false);
            beginSeoPolling(form.id, response.data.id);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Не удалось запустить SEO-генерацию");
        } finally {
            setSeoStarting(false);
        }
    };

    const seoRunning = Boolean(
        seoGeneration && !["completed", "failed", "conflicted"].includes(seoGeneration.status),
    );

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
                    <p className="mt-1 text-sm text-admin-text-secondary">
                        Редактирование продукта
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {seoGeneration ? (
                        <span className="text-xs text-admin-text-secondary">
                            SEO: {seoGeneration.external_status || seoGeneration.status}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => void handleOpenSeoGeneration()}
                        disabled={seoStarting || seoRunning || loading}
                        className="rounded-lg bg-admin-primary px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {seoStarting
                            ? "Подготовка…"
                            : seoRunning
                              ? "Уникализация…"
                              : "Уникализировать"}
                    </button>
                    <Link
                        href="/admin/products"
                        className="rounded-lg border px-4 py-2 text-sm"
                    >
                        Назад
                    </Link>
                </div>
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

            {seoGeneration &&
            ["failed", "conflicted"].includes(seoGeneration.status) &&
            seoGeneration.error ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <span className="font-medium">Ошибка SEO-генерации:</span>{" "}
                    {seoGeneration.error}
                    <details className="mt-2">
                        <summary className="cursor-pointer font-medium">
                            Что отправлено и получено
                        </summary>
                        <div className="mt-2 grid gap-2 lg:grid-cols-2">
                            <div className="min-w-0">
                                <div className="mb-1 text-xs font-medium">Отправлено</div>
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-xs">
                                    {JSON.stringify(seoGeneration.request_payload, null, 2)}
                                </pre>
                            </div>
                            <div className="min-w-0">
                                <div className="mb-1 text-xs font-medium">Получено</div>
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-xs">
                                    {JSON.stringify(seoGeneration.raw_result, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </details>
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
                            productBrandName={productData.brand?.name}
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
                                <label className="mb-1 block text-sm text-admin-text-secondary">
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
                                    className="w-full rounded-lg border px-3 py-2 text-sm"
                                    placeholder="Пусто — авто с витрины"
                                />
                                {seoTitlePreview ? (
                                    <p className="mt-1.5 text-xs text-admin-text-secondary">
                                        {seoTitlePreview}
                                    </p>
                                ) : null}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-admin-text-secondary">
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
                                    className="min-h-[120px] w-full rounded-lg border px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-admin-text-secondary">
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
                                    className="min-h-[90px] w-full rounded-lg border px-3 py-2 text-sm"
                                />
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="rounded-lg bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
                                >
                                    {submitting ? "Сохранение..." : "Сохранить"}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : null}

            {seoModalOpen && seoPreview ? (
                <ProductSeoGenerationModal
                    open
                    fields={seoPreview}
                    loading={seoStarting}
                    onCloseAction={() => {
                        if (!seoStarting) {
                            setSeoModalOpen(false);
                        }
                    }}
                    onSubmitAction={(fields, confirmManualChanges) =>
                        void handleStartSeoGeneration(fields, confirmManualChanges)
                    }
                />
            ) : null}
        </AdminPageCard>
    );
}
