"use client";

type HeaderMobileToggleProps = {
    isOpen: boolean;
    onClickAction: () => void;
};

export default function HeaderMobileToggle({
    isOpen,
    onClickAction,
}: HeaderMobileToggleProps) {
    return (
        <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] md:hidden"
            onClick={onClickAction}
            aria-label="Открыть меню"
        >
            <span className="text-lg leading-none">{isOpen ? "×" : "☰"}</span>
        </button>
    );
}
