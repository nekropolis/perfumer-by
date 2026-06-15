"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { siteMenuRow } from "@/lib/site-ui-classes";

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

    if (!mounted || !isOpen || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[200] pointer-events-auto" aria-hidden={false}>
            <button
                type="button"
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
                aria-label="Закрыть меню каталога"
                onClick={onCloseAction}
            />

            <div className="fixed left-0 top-0 flex h-full w-full max-w-md flex-col overflow-hidden border-r border-admin-border bg-admin-surface shadow-2xl">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-admin-border px-5 py-4">
                    <div>
                        <div className="text-lg font-semibold text-admin-text">Каталог</div>
                        <div className="mt-0.5 text-sm text-admin-text-secondary">
                            Категории и бренды
                        </div>
                    </div>

                    <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-admin-border bg-admin-surface text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                        onClick={onCloseAction}
                        aria-label="Закрыть"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                    <div className="space-y-6">
                        {sections.map((section) => (
                            <div key={section.title}>
                                <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                                    {section.title}
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    {section.links.map((link) => (
                                        <Link
                                            key={`${section.title}-${link.href}`}
                                            href={link.href}
                                            className={siteMenuRow}
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
            </div>
        </div>,
        document.body
    );
}
