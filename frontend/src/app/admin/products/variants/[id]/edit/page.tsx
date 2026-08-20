"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import ProductVariantDefinitionForm, {
    type ProductVariantDefinitionFormState,
} from "@/components/admin/products/product-variant-definition-form";
import {
    draftsFromSetDefinitionLabels,
    setLabelsFromDraftRows,
    type ProductSetDraftRow,
} from "@/components/admin/products/product-sets-editor";
import {
    fetchVariantDefinition,
    updateVariantDefinition,
} from "@/lib/admin-product-variants-api";
import { formatDecimalInputValue, parseDecimalInput } from "@/lib/parse-decimal-input";

const VARIANTS_BASE = "/admin/products/variants";

export default function AdminProductVariantEditPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();

    const [form, setForm] = useState<ProductVariantDefinitionFormState | null>(null);
    const [setDraftRows, setSetDraftRows] = useState<ProductSetDraftRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadItem = async () => {
            setLoading(true);
            setError("");

            try {
                const data = await fetchVariantDefinition(params.id);
                const item = data.data;
                setForm({
                    id: item.id,
                    title: item.title,
                    volume_ml: item.volume_ml != null ? formatDecimalInputValue(item.volume_ml) : "",
                    concentration_code: item.concentration_code ?? "",
                    concentration_label: item.concentration_label ?? "",
                    is_tester: !!item.is_tester,
                    is_vial: !!item.is_vial,
                    is_miniature: !!item.is_miniature,
                    is_set: !!item.is_set,
                    excludes_from_free_delivery_threshold: !!item.excludes_from_free_delivery_threshold,
                });
                setSetDraftRows(
                    item.is_set
                        ? draftsFromSetDefinitionLabels(item.volume_label, item.concentration_label)
                        : [],
                );
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки варианта");
            } finally {
                setLoading(false);
            }
        };

        void loadItem();
    }, [params.id]);

    const handleSubmit = async () => {
        if (!form?.id) {
            return;
        }

        setSubmitting(true);
        setError("");

        if (form.is_set) {
            if (setDraftRows.length === 0) {
                setError("Состав набора не может быть пустым");
                setSubmitting(false);
                return;
            }

            const labels = setLabelsFromDraftRows(setDraftRows);

            try {
                await updateVariantDefinition(form.id, {
                    is_set: true,
                    volume_label: labels.volume_label,
                    concentration_label: labels.concentration_label,
                    excludes_from_free_delivery_threshold: form.excludes_from_free_delivery_threshold,
                });
                router.push(VARIANTS_BASE);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка сохранения варианта");
            } finally {
                setSubmitting(false);
            }
            return;
        }

        if (!form.volume_ml || !form.concentration_code.trim() || !form.concentration_label.trim()) {
            setError("Объем, код и описание обязательны");
            setSubmitting(false);
            return;
        }

        const volumeMl = parseDecimalInput(form.volume_ml);
        if (volumeMl === null || volumeMl < 0.1) {
            setError("Укажите корректный объем от 0,1 мл, например 1,3 или 100");
            setSubmitting(false);
            return;
        }

        try {
            await updateVariantDefinition(form.id, {
                volume_ml: volumeMl,
                concentration_code: form.concentration_code.trim(),
                concentration_label: form.concentration_label.trim(),
                is_tester: form.is_tester,
                is_vial: form.is_vial,
                is_miniature: form.is_miniature,
                is_set: false,
                excludes_from_free_delivery_threshold: form.excludes_from_free_delivery_threshold,
            });

            router.push(VARIANTS_BASE);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения варианта");
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
                    { label: "Редактирование" },
                ]}
            />

            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Редактировать вариант - {form?.title || ""}
                    </h1>
                    <p className="mt-1 text-sm text-admin-text-secondary">Редактирование варианта справочника</p>
                </div>

                <Link href={VARIANTS_BASE} className="rounded-lg border px-4 py-2 text-sm">
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
                <AdminLoadingState text="Загрузка варианта..." />
            ) : form ? (
                <ProductVariantDefinitionForm
                    form={form}
                    submitting={submitting}
                    setDraftRows={setDraftRows}
                    onChangeAction={(next) => {
                        setForm(next);
                        if (!next.is_set) {
                            setSetDraftRows([]);
                        }
                    }}
                    onSetDraftRowsChangeAction={setSetDraftRows}
                    onSubmitAction={handleSubmit}
                />
            ) : null}
        </AdminPageCard>
    );
}
