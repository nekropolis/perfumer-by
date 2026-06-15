"use client";

import type { RefObject } from "react";
import { siteBtnGhost } from "@/lib/site-ui-classes";

type HeaderServiceBarProps = {
    isCompact: boolean;
    promoText: string;
    phoneShortLabel: string;
    phoneDropdownLinks: ReadonlyArray<{ label: string; href: string }>;
    messengerLinks: ReadonlyArray<{
        id: string;
        label: string;
        appHref: string;
        webHref: string;
    }>;
    isPhoneDropdownOpen: boolean;
    phoneDropdownRef: RefObject<HTMLDivElement | null>;
    onTogglePhoneDropdownAction: () => void;
    onClosePhoneDropdownAction: () => void;
    onOpenMessengerAction: (appHref: string, webHref: string) => void;
};

export default function HeaderServiceBar({
    isCompact,
    promoText,
    phoneShortLabel,
    phoneDropdownLinks,
    messengerLinks,
    isPhoneDropdownOpen,
    phoneDropdownRef,
    onTogglePhoneDropdownAction,
    onClosePhoneDropdownAction,
    onOpenMessengerAction,
}: HeaderServiceBarProps) {
    return (
        <div
            className={`hidden bg-admin-primary text-white transition-[max-height,opacity] duration-250 ease-out md:block ${
                isCompact ? "max-h-0 overflow-hidden opacity-0" : "max-h-9 opacity-100"
            }`}
            aria-hidden={isCompact}
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-9 items-center justify-between text-xs">
                    <div className="truncate font-medium">{promoText}</div>

                    <div className="flex items-center gap-2 text-white/80">
                        <div className="relative" ref={phoneDropdownRef}>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-white/10 hover:text-white"
                                onClick={onTogglePhoneDropdownAction}
                            >
                                <span>{phoneShortLabel}</span>
                                <span className="hidden text-white/60 sm:inline">МТС / A1 / life</span>
                                <svg
                                    aria-hidden
                                    viewBox="0 0 20 20"
                                    className={`h-3.5 w-3.5 transition-transform duration-200 ${isPhoneDropdownOpen ? "rotate-180" : ""}`}
                                    fill="none"
                                >
                                    <path
                                        d="M5.5 7.5L10 12l4.5-4.5"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </button>

                            {isPhoneDropdownOpen ? (
                                <div className="absolute right-0 top-8 z-50 w-64 rounded-xl border border-admin-border bg-admin-surface p-1.5 shadow-xl">
                                    {phoneDropdownLinks.map((item) => (
                                        <a
                                            key={item.label}
                                            href={item.href}
                                            className={`${siteBtnGhost} block w-full rounded-lg px-3 py-2 text-left text-xs`}
                                            onClick={onClosePhoneDropdownAction}
                                        >
                                            {item.label}
                                        </a>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        {messengerLinks.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
                                onClick={() => onOpenMessengerAction(item.appHref, item.webHref)}
                                title={item.label}
                                aria-label={item.label}
                            >
                                {item.id === "telegram" ? (
                                    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                        <path d="M21.944 4.256a1.5 1.5 0 0 0-1.74-.275L3.25 11.34a1.5 1.5 0 0 0 .147 2.786l4.441 1.474 1.468 4.62a1.5 1.5 0 0 0 2.648.49l2.472-3.235 4.387 3.216a1.5 1.5 0 0 0 2.335-.876l2.97-14.027a1.5 1.5 0 0 0-.174-1.232ZM10.7 14.553l-.58 3.363-.83-2.612L16.9 8.17l-6.2 6.383Z" />
                                    </svg>
                                ) : (
                                    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                        <path d="M20.75 14.37c-.22-.18-1.3-.95-1.5-1.02-.2-.08-.35-.11-.5.11-.14.22-.58.73-.71.88-.13.15-.26.17-.48.06-.22-.11-.93-.34-1.78-1.08-.66-.58-1.1-1.3-1.23-1.52-.13-.22-.01-.34.1-.45.1-.1.22-.26.34-.39.11-.13.14-.22.22-.37.07-.15.04-.28-.02-.39-.06-.11-.5-1.2-.69-1.64-.18-.43-.37-.37-.5-.38h-.43c-.15 0-.39.06-.59.28-.2.22-.77.75-.77 1.84 0 1.1.79 2.16.9 2.31.11.15 1.56 2.4 3.78 3.37 2.23.97 2.23.65 2.63.61.39-.04 1.3-.53 1.49-1.04.18-.5.18-.94.13-1.03-.06-.08-.2-.13-.42-.24ZM12.02 2C6.5 2 2 6.34 2 11.68c0 2.2.77 4.21 2.06 5.8L3 22l4.8-1.02a10.2 10.2 0 0 0 4.22.91c5.52 0 10.02-4.34 10.02-9.68S17.54 2 12.02 2Zm0 17.64c-1.3 0-2.57-.31-3.7-.89l-.26-.13-2.85.6.61-2.74-.17-.28a7.2 7.2 0 0 1-1.13-3.87c0-4 3.39-7.26 7.5-7.26 4.14 0 7.52 3.26 7.52 7.26 0 4.01-3.38 7.3-7.52 7.3Z" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
