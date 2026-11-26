type BodyScrollLockSnapshot = {
    bodyOverscrollBehavior: string;
    htmlOverscrollBehavior: string;
};

/**
 * Блокирует «протягивание» фона без overflow:hidden / position:fixed —
 * иначе ломается position:sticky (шапка и тулбар каталога исчезают).
 * Скролл фона дополнительно режется через touchmove/wheel у вызывающего.
 */
export function lockBodyScroll(): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    const body = document.body;
    const html = document.documentElement;

    const previous: BodyScrollLockSnapshot = {
        bodyOverscrollBehavior: body.style.overscrollBehavior,
        htmlOverscrollBehavior: html.style.overscrollBehavior,
    };

    body.style.overscrollBehavior = "none";
    html.style.overscrollBehavior = "none";

    return () => {
        body.style.overscrollBehavior = previous.bodyOverscrollBehavior;
        html.style.overscrollBehavior = previous.htmlOverscrollBehavior;
    };
}

let sheetTabHolds = 0;

/** Держит нижнее меню поверх открытого листа. Несколько листов не снимают флаг раньше времени. */
export function holdStorefrontTabBar(): () => void {
    if (typeof document === "undefined") {
        return () => {};
    }
    sheetTabHolds += 1;
    document.documentElement.dataset.storefrontSheetTab = "1";
    return () => {
        sheetTabHolds = Math.max(0, sheetTabHolds - 1);
        if (sheetTabHolds === 0) {
            delete document.documentElement.dataset.storefrontSheetTab;
        }
    };
}
