import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

type Options = {
    /** Диалог реально отрисован (контейнер в DOM). */
    open: boolean;
    containerRef: RefObject<HTMLElement | null>;
    onClose: () => void;
    /** false — Escape не закрывает (например, идёт отправка формы). */
    closeOnEscape?: boolean;
    /** false — не переносить фокус внутрь при открытии (фокус ставит вызывающий код). */
    initialFocus?: boolean;
};

function getFocusable(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0,
    );
}

/** Только верхний модальный диалог реагирует на клавиши (вложенные модалки, auth-modal). */
function isTopmostModal(container: HTMLElement): boolean {
    const modals = document.querySelectorAll('[aria-modal="true"]');
    return modals.length === 0 || modals[modals.length - 1] === container;
}

/**
 * Клавиатурная доступность модального диалога: Escape, ловушка фокуса (Tab / Shift+Tab),
 * фокус внутрь при открытии и возврат фокуса на прежний элемент при закрытии.
 * Контейнеру нужны role="dialog" и aria-modal="true".
 */
export function useDialogA11y({
    open,
    containerRef,
    onClose,
    closeOnEscape = true,
    initialFocus = true,
}: Options): void {
    const onCloseRef = useRef(onClose);
    const closeOnEscapeRef = useRef(closeOnEscape);

    useEffect(() => {
        onCloseRef.current = onClose;
        closeOnEscapeRef.current = closeOnEscape;
    });

    useEffect(() => {
        if (!open) {
            return;
        }
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const previouslyFocused =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        if (initialFocus && !container.contains(document.activeElement)) {
            const target = getFocusable(container)[0] ?? container;
            if (target === container && !container.hasAttribute("tabindex")) {
                container.setAttribute("tabindex", "-1");
            }
            target.focus({ preventScroll: true });
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isTopmostModal(container)) {
                return;
            }

            if (event.key === "Escape") {
                if (closeOnEscapeRef.current) {
                    onCloseRef.current();
                }
                return;
            }

            if (event.key !== "Tab") {
                return;
            }

            const focusable = getFocusable(container);
            if (focusable.length === 0) {
                event.preventDefault();
                container.focus({ preventScroll: true });
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            const inside = active instanceof Node && container.contains(active);

            if (event.shiftKey && (!inside || active === first || active === container)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (!inside || active === last)) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            if (previouslyFocused?.isConnected) {
                previouslyFocused.focus({ preventScroll: true });
            }
        };
    }, [open, containerRef, initialFocus]);
}
