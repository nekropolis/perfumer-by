"use client";

import { useMemo, useState } from "react";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import type {
    ProductSeoField,
    ProductSeoFieldState,
} from "@/lib/admin-products-api";
import {
    defaultProductSeoFields,
    hasManualProductSeoFields,
} from "@/lib/product-seo-polling";

const FIELD_LABELS: Record<ProductSeoField, string> = {
    seo_description: "SEO description",
    short_description: "Краткое описание",
    description: "Описание",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as ProductSeoField[];

type Props = {
    open: boolean;
    fields: Record<ProductSeoField, ProductSeoFieldState>;
    loading: boolean;
    onCloseAction: () => void;
    onSubmitAction: (selectedFields: ProductSeoField[], confirmManualChanges: boolean) => void;
};

export default function ProductSeoGenerationModal({
    open,
    fields,
    loading,
    onCloseAction,
    onSubmitAction,
}: Props) {
    const [selected, setSelected] = useState<ProductSeoField[]>(() =>
        defaultProductSeoFields(fields, FIELD_ORDER),
    );
    const [confirmManual, setConfirmManual] = useState(false);

    const hasSelectedManual = useMemo(
        () => hasManualProductSeoFields(selected, fields),
        [fields, selected],
    );
    const canSubmit = selected.length > 0 && (!hasSelectedManual || confirmManual) && !loading;

    return (
        <AdminModalShell
            open={open}
            onCloseAction={onCloseAction}
            title="Уникализация продукта"
            footer={
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCloseAction}
                        disabled={loading}
                        className="rounded-lg border border-admin-border px-3 py-2 text-sm"
                    >
                        Отмена
                    </button>
                    <button
                        type="button"
                        onClick={() => onSubmitAction(selected, confirmManual)}
                        disabled={!canSubmit}
                        className="rounded-lg bg-admin-primary px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {loading ? "Запуск…" : "Уникализировать"}
                    </button>
                </div>
            }
        >
            <div className="space-y-3">
                <p className="text-sm text-admin-text-secondary">
                    Выберите поля. Уже уникализированные поля повторно не отправляются.
                </p>
                {FIELD_ORDER.map((field) => {
                          const item = fields[field];
                          const generated = item.state === "generated";
                          const manual = item.state === "manually_changed";
                          return (
                              <label
                                  key={field}
                                  className="flex items-start gap-3 rounded-lg border border-admin-border p-3"
                              >
                                  <input
                                      type="checkbox"
                                      checked={selected.includes(field)}
                                      disabled={generated || loading}
                                      onChange={(event) =>
                                          setSelected((current) =>
                                              event.target.checked
                                                  ? [...current, field]
                                                  : current.filter((value) => value !== field),
                                          )
                                      }
                                      className="mt-0.5"
                                  />
                                  <span className="min-w-0">
                                      <span className="block text-sm font-medium text-admin-text">
                                          {FIELD_LABELS[field]}
                                      </span>
                                      <span
                                          className={`block text-xs ${
                                              manual ? "text-amber-700" : "text-admin-text-secondary"
                                          }`}
                                      >
                                          {generated
                                              ? "Уже уникализировано"
                                              : manual
                                                ? "Есть ручное значение — при выборе оно будет перезаписано"
                                                : "Будет сгенерировано"}
                                      </span>
                                  </span>
                              </label>
                          );
                      })}

                {hasSelectedManual ? (
                    <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                        <input
                            type="checkbox"
                            checked={confirmManual}
                            onChange={(event) => setConfirmManual(event.target.checked)}
                            className="mt-0.5"
                        />
                        Подтверждаю перезапись выбранных полей с ручными изменениями.
                    </label>
                ) : null}
            </div>
        </AdminModalShell>
    );
}
