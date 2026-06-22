"use client";

import { useEffect, useState } from "react";
import { updateProductVariant } from "@/lib/admin-product-variants-api";

type Props = {
    productId: number;
    variantId: number;
    checked: boolean;
    disabled?: boolean;
    onUpdatedAction?: (next: boolean) => void;
    onErrorAction?: (message: string) => void;
};

export default function VariantPromotionToggle({
    productId,
    variantId,
    checked,
    disabled = false,
    onUpdatedAction,
    onErrorAction,
}: Props) {
    const [saving, setSaving] = useState(false);
    const [value, setValue] = useState(checked);

    useEffect(() => {
        setValue(checked);
    }, [checked]);

    const handleChange = async (next: boolean) => {
        const previous = value;
        setValue(next);
        setSaving(true);

        try {
            await updateProductVariant(productId, variantId, { is_promotion: next });
            onUpdatedAction?.(next);
        } catch (e: unknown) {
            setValue(previous);
            onErrorAction?.(e instanceof Error ? e.message : "Не удалось обновить акцию");
        } finally {
            setSaving(false);
        }
    };

    return (
        <label
            className={`inline-flex items-center gap-1.5 text-xs text-admin-text ${
                disabled || saving ? "opacity-60" : ""
            }`}
            title="Акция на витрине"
        >
            <input
                type="checkbox"
                checked={value}
                disabled={disabled || saving}
                onChange={(e) => void handleChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300"
            />
            <span className="whitespace-nowrap">Акция</span>
        </label>
    );
}
