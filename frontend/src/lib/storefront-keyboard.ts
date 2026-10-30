/** Mark fixed bottom bars that contain text inputs (certificate, search sheet, …). */
export const STOREFRONT_KEYBOARD_DOCK_ATTR = "data-storefront-keyboard-dock";

/** Focus inside: keep the storefront tab bar visible (benefit certificate sheet). */
export const STOREFRONT_KEEP_TAB_BAR_ATTR = "data-storefront-keep-tab-bar";

const NON_TEXT_INPUT_TYPES = new Set([
    "checkbox",
    "radio",
    "button",
    "submit",
    "reset",
    "file",
    "range",
    "hidden",
    "color",
    "image",
]);

export function isStorefrontEditable(el: Element | null): el is HTMLElement {
    if (el instanceof HTMLTextAreaElement) {
        return true;
    }
    if (el instanceof HTMLInputElement) {
        return !NON_TEXT_INPUT_TYPES.has(el.type);
    }
    return el instanceof HTMLElement && el.isContentEditable;
}

export function getVisualViewportHeight(): number {
    return window.visualViewport?.height ?? window.innerHeight;
}

/** Shrink of visual viewport vs a baseline (usually height at focus). */
export function getViewportShrinkPx(baselineHeight: number): number {
    if (!(baselineHeight > 0)) {
        return 0;
    }
    const viewport = window.visualViewport;
    if (viewport && Math.abs(viewport.scale - 1) > 0.02) {
        return 0;
    }
    return Math.max(0, Math.round(baselineHeight - getVisualViewportHeight()));
}

/** Keyboard vs URL-bar: treat as keyboard when shrink is clearly large. */
export const KEYBOARD_OPEN_THRESHOLD_PX = 120;

/** After dismiss, viewport nearly back — show sticky again even if focus remains. */
export const KEYBOARD_CLOSED_THRESHOLD_PX = 48;
