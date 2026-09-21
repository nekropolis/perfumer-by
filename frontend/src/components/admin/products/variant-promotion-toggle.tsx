"use client";

import { useEffect, useState } from "react";
import { updateProductVariant } from "@/lib/admin-product-variants-api";
import { adminCheckbox } from "@/lib/admin-ui-classes";

const ENABLE_HINT = "Акцию можно включить только при свободном остатке на складе (не в резерве)";

type Props = {
    productId: number;
    variantId: number;
    checked: boolean;
    disabled?: boolean;
    /** Свободный остаток на основном складе > 0. Снять акцию можно всегда. */
    canEnable?: boolean;
    onUpdatedAction?: (next: boolean) => void;
    onErrorAction?: (message: string) => void;
};

export default function VariantPromotionToggle({
    productId,
    variantId,
    checked,
    disabled = false,
    canEnable = false,
    onUpdatedAction,
    onErrorAction,
}: Props) {
    const [saving, setSaving] = useState(false);
    const [value, setValue] = useState(checked);

    useEffect(() => {
        setValue(checked);
    }, [checked]);

    const enableBlocked = !canEnable && !value;

    const handleChange = async (next: boolean) => {
        if (next && !canEnable) {
            return;
        }

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
            className={`inline-flex items-center ${disabled || saving || enableBlocked ? "opacity-60" : ""}`}
            title={enableBlocked ? ENABLE_HINT : "Акция на витрине"}
        >
            <input
                type="checkbox"
                checked={value}
                disabled={disabled || saving || enableBlocked}
                onChange={(e) => void handleChange(e.target.checked)}
                className={adminCheckbox}
                aria-label="Акция на витрине"
            />
        </label>
    );
}
