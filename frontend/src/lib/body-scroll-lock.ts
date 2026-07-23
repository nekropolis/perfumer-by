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
