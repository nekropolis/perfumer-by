"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type Props = {
    isOpen: boolean;
    sections: ReadonlyArray<{
        title: string;
        links: ReadonlyArray<{
            label: string;
            href: string;
        }>;
    }>;
    onCloseAction: () => void;
};

export default function HeaderCatalogDrawer({
    isOpen,
    sections,
    onCloseAction,
}: Props) {
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    if (!mounted || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            className={`fixed inset-0 z-[200] transition-opacity duration-300 ${
                isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!isOpen}
        >
            <button
                type="button"
                className={`absolute inset-0 bg-[var(--foreground)]/30 backdrop-blur-[2px] transition-opacity duration-300 ${
                    isOpen ? "opacity-100" : "opacity-0"
                }`}
                aria-label="Закрыть меню каталога"
                onClick={onCloseAction}
            />

            <div
                className={`fixed left-0 top-0 h-full w-full max-w-[460px] overflow-y-auto bg-[var(--surface)] p-6 shadow-2xl transition-transform duration-300 ease-out ${
                    isOpen ? "translate-x-0" : "-translate-x-6"
                }`}
            >
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <div className="text-xl font-semibold text-[var(--foreground)]">Каталог</div>
                        <div className="mt-1 text-sm text-[var(--text-secondary)]">
                            Подберите аромат по категориям и брендам
                        </div>
                    </div>

                    <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-lg text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--accent)]"
                        onClick={onCloseAction}
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>

                <div className="space-y-8">
                    {sections.map((section) => (
                        <div key={section.title}>
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                {section.title}
                            </div>

                            <div className="space-y-1">
                                {section.links.map((link) => (
                                    <Link
                                        key={`${section.title}-${link.href}`}
                                        href={link.href}
                                        className="block rounded-2xl px-4 py-3 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)] hover:text-[var(--accent)]"
                                        onClick={onCloseAction}
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}