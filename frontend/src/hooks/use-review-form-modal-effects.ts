import { type RefObject, useEffect } from "react";
import { loadRecaptchaScript } from "@/lib/recaptcha-v3";

type Options = {
    /** Открыта ли модалка с формой отзыва */
    isOpen: boolean;
    /** @deprecated Escape теперь обрабатывает ReviewFormModal (useDialogA11y). */
    onRequestClose?: () => void;
    /** `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (пустая строка — скрипт не грузим) */
    siteKey: string;
    /** Поле для автофокуса при открытии */
    focusRef?: RefObject<HTMLInputElement | null>;
};

/**
 * Общая обвязка модалки отзыва: подгрузка reCAPTCHA v3, блокировка скролла body,
 * фокус на первом поле.
 */
export function useReviewFormModalEffects({ isOpen, siteKey, focusRef }: Options): void {
    useEffect(() => {
        if (!siteKey || typeof window === "undefined") {
            return;
        }
        void loadRecaptchaScript(siteKey).catch(() => {
            /* ignore */
        });
    }, [siteKey]);

    useEffect(() => {
        if (!isOpen || typeof document === "undefined") {
            return;
        }
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const el = focusRef?.current;
        if (!el) {
            return;
        }
        requestAnimationFrame(() => {
            el.focus();
        });
    }, [isOpen, focusRef]);
}
