"use client";

import Link from "next/link";

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

export default function HeaderCatalogDrawer({ isOpen, sections, onCloseAction }: Props) {
    return (
        <div
            className={`fixed inset-0 z-50 transition-opacity duration-300 ${isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
            aria-hidden={!isOpen}
        >
            <button
                type="button"
                className={`absolute inset-0 bg-black/35 backdrop-blur-[1px] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
                aria-label="Закрыть меню каталога"
                onClick={onCloseAction}
            />
            <div
                className={`absolute left-0 top-0 h-full w-full max-w-[420px] overflow-y-auto bg-white p-5 shadow-2xl transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "-translate-x-6"}`}
            >
                <div className="mb-5 flex items-center justify-between">
                    <div className="text-lg font-semibold">Каталог</div>
                    <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border text-lg"
                        onClick={onCloseAction}
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </div>

                <div className="space-y-5">
                    {sections.map((section) => (
                        <div key={section.title}>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                {section.title}
                            </div>
                            <div className="space-y-1">
                                {section.links.map((link) => (
                                    <Link
                                        key={`${section.title}-${link.href}`}
                                        href={link.href}
                                        className="block rounded-xl px-3 py-2 text-sm text-gray-800 transition hover:bg-gray-50"
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
    );
}
