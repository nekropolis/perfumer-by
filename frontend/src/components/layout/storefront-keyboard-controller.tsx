"use client";

import { useEffect } from "react";
import {
    getViewportShrinkPx,
    getVisualViewportHeight,
    isStorefrontEditable,
    KEYBOARD_CLOSED_THRESHOLD_PX,
    KEYBOARD_OPEN_THRESHOLD_PX,
    STOREFRONT_KEEP_TAB_BAR_ATTR,
    STOREFRONT_KEYBOARD_DOCK_ATTR,
} from "@/lib/storefront-keyboard";

/**
 * Клавиатура / sticky на витрине:
 *
 * 1) При фокусе в поле — прячем tab/CTA сразу (иначе fixed-бар закрывает input).
 * 2) Dock-бар с инпутом (сертификат) помечаем сразу по focus внутри него — не ждём overlap.
 * 3) Свертывание кнопкой на клавиатуре iOS: focus остаётся, visualViewport вырастает обратно
 *    → снимаем keyboard-open БЕЗ blur, sticky возвращаются.
 */
export default function StorefrontKeyboardController() {
    useEffect(() => {
        const root = document.documentElement;
        let focusOutTimer: number | null = null;
        /** Высота visualViewport в момент focusin. */
        let vvHeightOnFocus = 0;
        /** Клавиатура уже открывалась (viewport заметно сжался) для этого фокуса. */
        let sawKeyboardForFocus = false;

        const clearFocusOutTimer = () => {
            if (focusOutTimer != null) {
                window.clearTimeout(focusOutTimer);
                focusOutTimer = null;
            }
        };

        const sync = () => {
            if (window.matchMedia("(min-width: 768px)").matches) {
                vvHeightOnFocus = 0;
                sawKeyboardForFocus = false;
                delete root.dataset.storefrontKeyboard;
                delete root.dataset.storefrontKeyboardDock;
                delete root.dataset.storefrontKeepTabBar;
                root.style.setProperty("--storefront-keyboard-overlap", "0px");
                return;
            }

            const active = document.activeElement;
            const typing = isStorefrontEditable(active);
            const shrink = getViewportShrinkPx(vvHeightOnFocus);

            if (!typing) {
                vvHeightOnFocus = 0;
                sawKeyboardForFocus = false;
            } else if (shrink >= KEYBOARD_OPEN_THRESHOLD_PX) {
                sawKeyboardForFocus = true;
            }

            // iOS «свернуть»: focus есть, viewport почти восстановился после реального открытия.
            const dismissedKeepFocus =
                typing && sawKeyboardForFocus && shrink <= KEYBOARD_CLOSED_THRESHOLD_PX;

            const open = typing && !dismissedKeepFocus;

            if (open) {
                root.dataset.storefrontKeyboard = "open";
                root.style.setProperty(
                    "--storefront-keyboard-overlap",
                    `${Math.max(shrink, 0)}px`,
                );
            } else {
                delete root.dataset.storefrontKeyboard;
                root.style.setProperty("--storefront-keyboard-overlap", "0px");
            }

            const keepTabBar =
                typing && active instanceof Element
                    ? active.closest(`[${STOREFRONT_KEEP_TAB_BAR_ATTR}]`)
                    : null;
            if (keepTabBar) {
                root.dataset.storefrontKeepTabBar = "1";
            } else {
                delete root.dataset.storefrontKeepTabBar;
            }

            // Dock сразу при фокусе внутри бара — иначе CTA с input прячется целиком.
            const dockHost =
                open && typing && active instanceof Element
                    ? active.closest(`[${STOREFRONT_KEYBOARD_DOCK_ATTR}]`)
                    : null;

            if (dockHost) {
                root.dataset.storefrontKeyboardDock = "1";
            } else {
                delete root.dataset.storefrontKeyboardDock;
            }
        };

        const onFocusIn = () => {
            clearFocusOutTimer();
            if (isStorefrontEditable(document.activeElement)) {
                vvHeightOnFocus = getVisualViewportHeight();
                sawKeyboardForFocus = false;
            }
            sync();
        };

        const onFocusOut = () => {
            clearFocusOutTimer();
            focusOutTimer = window.setTimeout(() => {
                if (!isStorefrontEditable(document.activeElement)) {
                    vvHeightOnFocus = 0;
                    sawKeyboardForFocus = false;
                }
                sync();
            }, 80);
        };

        sync();
        window.visualViewport?.addEventListener("resize", sync);
        window.visualViewport?.addEventListener("scroll", sync);
        window.addEventListener("resize", sync);
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);

        return () => {
            clearFocusOutTimer();
            window.visualViewport?.removeEventListener("resize", sync);
            window.visualViewport?.removeEventListener("scroll", sync);
            window.removeEventListener("resize", sync);
            document.removeEventListener("focusin", onFocusIn);
            document.removeEventListener("focusout", onFocusOut);
            delete root.dataset.storefrontKeyboard;
            delete root.dataset.storefrontKeyboardDock;
            delete root.dataset.storefrontKeepTabBar;
            root.style.setProperty("--storefront-keyboard-overlap", "0px");
        };
    }, []);

    return null;
}
