/** Shared Tailwind class strings for admin CRM UI */

export const adminBtnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-admin-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-admin-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-primary disabled:cursor-not-allowed disabled:opacity-50";

export const adminBtnSecondary =
  "inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-black/[0.06] bg-white px-3.5 py-2 text-sm font-medium text-admin-text shadow-[0_3px_8px_rgba(15,23,42,0.08)] transition-[transform,background-color,box-shadow,color] duration-200 ease-out hover:scale-[1.04] hover:bg-slate-100 hover:text-slate-900 hover:shadow-[0_6px_14px_rgba(15,23,42,0.16)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:shadow-[0_3px_8px_rgba(15,23,42,0.08)]";

/** Icon-only control — soft UI hover (scale + darken). */
export const adminIconBtn =
  "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/[0.06] bg-white text-admin-text shadow-[0_3px_8px_rgba(15,23,42,0.08)] transition-[transform,background-color,box-shadow,color] duration-200 ease-out hover:scale-110 hover:bg-slate-100 hover:text-slate-900 hover:shadow-[0_6px_14px_rgba(15,23,42,0.16)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:shadow-[0_3px_8px_rgba(15,23,42,0.08)]";

export const adminBtnGhost =
  "inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text";

export const adminBtnDanger =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50";

/** Compact table / row actions — keep ≥32px for touch */
export const adminBtnSm =
  "inline-flex h-8 items-center justify-center rounded-lg border border-admin-border bg-admin-surface px-3 text-xs font-medium text-admin-text transition hover:bg-admin-muted disabled:cursor-not-allowed disabled:opacity-50";

export const adminInput =
  "w-full min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-muted outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15";

export const adminSelect =
  "min-h-10 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15";

export const adminTextarea =
  "w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-muted outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15";

export const adminCard =
  "rounded-xl border border-admin-border bg-admin-surface shadow-admin-card";

export const adminPageShell = "bg-admin-surface";

export const adminCardPadding = "p-4 sm:p-5";

export const adminPageTitle =
  "text-xl font-semibold tracking-tight text-admin-text sm:text-2xl";

export const adminPageSubtitle =
  "mt-1 text-sm leading-relaxed text-admin-text-secondary";

export const adminTableHead =
  "border-b border-admin-border bg-admin-bg text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-admin-text-secondary";

export const adminTableCell =
  "border-b border-admin-border/80 px-3 py-2.5 text-sm leading-snug text-admin-text";

export const adminTableRowHover = "transition hover:bg-admin-muted/70";

export const adminModalOverlay =
  "fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-4";

export const adminModalPanel =
  "flex max-h-[min(92dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface shadow-2xl sm:max-h-[min(88dvh,900px)] sm:rounded-xl";

export const adminModalPanelCentered =
  "w-full max-w-lg flex-col overflow-hidden rounded-xl border border-admin-border bg-admin-surface shadow-2xl";

/** Native checkbox — admin primary accent, без focus-обводки от input:focus */
export const adminCheckbox =
  "h-4 w-4 shrink-0 cursor-pointer rounded border border-admin-border bg-transparent accent-admin-primary outline-none ring-0 focus:border-admin-border focus:outline-none focus:ring-0 focus:shadow-none checked:focus:border-admin-primary disabled:cursor-not-allowed disabled:opacity-50";
