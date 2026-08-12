import { createElement, type ReactNode } from "react";
import BynSign from "@/components/ui/byn-sign";

/**
 * Официальный графический знак белорусского рубля (НБРБ, постановление №25 от 27.01.2026).
 * В UI рендерим SVG — системные шрифты ещё не содержат Unicode U+20C5.
 * @see https://www.nbrb.by/coinsbanknotes/byn-ico
 */
export function withBynSign(amount: string): ReactNode {
    return createElement(
        "span",
        { className: "whitespace-nowrap" },
        amount,
        "\u00A0",
        createElement(BynSign),
    );
}

/** Диапазон цен: «12,00 – 34,00 ¤» (знак один раз в конце). */
export function withBynSignRange(min: string, max: string): ReactNode {
    return createElement(
        "span",
        { className: "whitespace-nowrap" },
        `${min} – ${max}`,
        "\u00A0",
        createElement(BynSign),
    );
}

/** Для plain-text контекстов (подсказки), где SVG недоступен. */
export function withBynSignText(amount: string): string {
    return `${amount}\u00A0руб.`;
}

/**
 * Заголовок шаблона сертификата из БД часто оканчивается на «BYN»
 * (например «Сертификат 50 BYN») — подменяем на официальный знак.
 */
export function withBynSignReplacingCode(text: string): ReactNode {
    const trimmed = text.trim();
    const match = trimmed.match(/^(.*?)\s+BYN\s*$/i);
    if (match && match[1].trim() !== "") {
        return withBynSign(match[1].trimEnd());
    }
    return trimmed;
}

/** Plain-text: «… BYN» → «… руб.» (корзина confirm, aria и т.п.). */
export function withBynSignReplacingCodeText(text: string): string {
    return text.replace(/\s+BYN\b/gi, "\u00A0руб.").trim();
}
