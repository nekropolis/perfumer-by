/**
 * Shared Tailwind class strings for storefront UI.
 *
 * Control radius knob (quick rollback):
 * - Current: rounded-2xl (matches header search / icon chrome)
 * - Rollback: replace "rounded-2xl" → "rounded-lg" in THIS FILE only
 *   (pages should use these tokens, not hardcode radius)
 * - Or: git revert the storefront-controls commit
 */

/** @deprecated Prefer tokens below; exported for rare composition. Rollback with file replace. */
export const siteControlRadius = "rounded-2xl";

export const siteBtnPrimary =
    "inline-flex min-h-10 items-center justify-center rounded-2xl bg-admin-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-admin-primary-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary disabled:cursor-not-allowed disabled:opacity-50";

export const siteBtnSecondary =
    "inline-flex min-h-10 items-center justify-center rounded-2xl border border-admin-border bg-admin-surface px-4 py-2.5 text-sm font-medium text-admin-text shadow-sm transition hover:border-admin-border-strong hover:bg-admin-muted active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const siteBtnGhost =
    "inline-flex min-h-10 items-center justify-center rounded-2xl px-3 py-2 text-sm font-medium text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text active:scale-[0.98]";

export const siteBtnIcon =
    "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-admin-border bg-admin-surface text-admin-text-secondary shadow-sm transition hover:border-admin-border-strong hover:bg-admin-muted hover:text-admin-text active:scale-[0.98]";

export const headerBtnIcon =
    "inline-flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--header-text-secondary)] transition hover:bg-[var(--header-control-bg)] hover:text-[var(--header-text)] active:scale-[0.98] md:h-11 md:w-11";

export const siteBtnIconPrimary =
    "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-admin-primary bg-admin-primary text-white shadow-sm transition hover:border-admin-primary-hover hover:bg-admin-primary-hover active:scale-[0.98] md:h-auto md:w-auto md:gap-2 md:px-4 md:py-2.5";

export const siteInput =
    "w-full min-h-10 rounded-2xl border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-muted outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15";

export const siteSelect =
    "min-h-10 rounded-2xl border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15";

export const siteTextarea =
    "w-full rounded-2xl border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-muted outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15";

/** Native checkbox — без focus-обводки от глобального input:focus */
export const siteCheckbox =
    "h-4 w-4 shrink-0 cursor-pointer rounded border border-admin-border bg-transparent accent-admin-primary outline-none ring-0 focus:border-admin-border focus:outline-none focus:ring-0 focus:shadow-none checked:focus:border-admin-primary disabled:cursor-not-allowed disabled:opacity-50";

export const siteCard =
    "rounded-xl border border-admin-border bg-admin-surface shadow-sm";

export const siteFilterChip =
    "inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition active:scale-[0.98]";

export const siteFilterChipActive =
    "border-admin-primary bg-admin-primary text-white";

export const siteFilterChipInactive =
    "border-admin-border bg-admin-surface text-admin-text hover:border-admin-border-strong hover:bg-admin-muted";

export const siteBtnDanger =
    "inline-flex min-h-10 items-center justify-center rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const siteNavLink =
    "group relative text-sm font-medium text-admin-text-secondary transition hover:text-admin-text";

export const siteMenuRow =
    "flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium text-admin-text transition hover:bg-admin-muted active:bg-admin-muted/80";
