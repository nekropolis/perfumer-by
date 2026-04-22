"use client";

type HeaderCatalogButtonProps = {
    label: string;
    onClickAction: () => void;
};

export default function HeaderCatalogButton({
    label,
    onClickAction,
}: HeaderCatalogButtonProps) {
    return (
        <button
            type="button"
            className="hidden h-11 items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--header-control-bg)] px-4 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--background)] hover:text-[var(--accent)] md:inline-flex"
            onClick={onClickAction}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
                aria-hidden
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                />
            </svg>
            {label}
        </button>
    );
}
