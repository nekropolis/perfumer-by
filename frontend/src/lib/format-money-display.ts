import type { ReactNode } from "react";
import { withBynSign, withBynSignText } from "@/lib/byn-sign";

export type MoneyRawInput = string | number | null | undefined;

/**
 * Денежная сумма для витрины: всегда 2 знака после запятой, разделитель запятая (например 22,20).
 * Принимает строку с API (точка или запятая) или число (например из настроек доставки).
 */
export function formatMoneyDisplay(raw: MoneyRawInput): string | null {
    if (raw == null) {
        return null;
    }
    if (typeof raw === "number") {
        if (!Number.isFinite(raw)) {
            return null;
        }
        return new Intl.NumberFormat("ru-RU", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(raw);
    }
    const s = String(raw).trim();
    if (s === "") {
        return null;
    }
    const normalized = s.replace(",", ".").replace(/\s+/g, "");
    const n = Number.parseFloat(normalized);
    if (!Number.isFinite(n)) {
        return null;
    }
    return new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}

/** Подпись для корзины/чекаута с официальным знаком рубля (SVG). */
export function formatMoneyRub(raw: MoneyRawInput): ReactNode {
    const v = formatMoneyDisplay(raw);
    if (v !== null) {
        return withBynSign(v);
    }
    const s = typeof raw === "number" ? "" : String(raw ?? "").trim();
    return s !== "" ? withBynSign(s) : withBynSign("0,00");
}

/** Plain-text вариант для строк-подсказок без React. */
export function formatMoneyRubText(raw: MoneyRawInput): string {
    const v = formatMoneyDisplay(raw);
    if (v !== null) {
        return withBynSignText(v);
    }
    const s = typeof raw === "number" ? "" : String(raw ?? "").trim();
    return s !== "" ? withBynSignText(s) : withBynSignText("0,00");
}
