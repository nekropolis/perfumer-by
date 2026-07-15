type BodyScrollLockSnapshot = {
    bodyOverflow: string;
    htmlOverflow: string;
    bodyPaddingRight: string;
};

/**
 * Блокирует скролл страницы без position:fixed на body —
 * иначе ломается position:sticky (тулбар каталога «прыгает»/исчезает).
 */
export function lockBodyScroll(): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    const body = document.body;
    const html = document.documentElement;
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

    const previous: BodyScrollLockSnapshot = {
        bodyOverflow: body.style.overflow,
        htmlOverflow: html.style.overflow,
        bodyPaddingRight: body.style.paddingRight,
    };

    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
        body.style.overflow = previous.bodyOverflow;
        html.style.overflow = previous.htmlOverflow;
        body.style.paddingRight = previous.bodyPaddingRight;
    };
}
