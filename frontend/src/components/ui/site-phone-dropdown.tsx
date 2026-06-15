"use client";

import { useEffect, useRef, useState } from "react";
import { useSiteContent } from "@/components/layout/site-content-context";
import { buildHeaderPhoneDropdown, phoneNationalShortSuffix } from "@/lib/site-contact";
import { siteBtnGhost } from "@/lib/site-ui-classes";

type SitePhoneDropdownProps = {
    className?: string;
    /** Крупнее на карточке товара — номер текстом, без рамки */
    size?: "sm" | "lg";
};

export default function SitePhoneDropdown({ className = "", size = "sm" }: SitePhoneDropdownProps) {
    const site = useSiteContent();
    const phoneShortLabel = phoneNationalShortSuffix(site.contact_phone_mts) || "640-88-33";
    const phoneDropdownLinks = buildHeaderPhoneDropdown(site);

    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [open]);

    const dropdown = open ? (
        <div
            className={`absolute z-50 min-w-[16rem] rounded-xl border border-admin-border bg-admin-surface p-1.5 shadow-xl ${
                size === "lg" ? "left-0 top-full mt-2" : "right-0 top-[calc(100%+0.375rem)]"
            }`}
        >
            {phoneDropdownLinks.map((item) => (
                <a
                    key={item.label}
                    href={item.href}
                    className={`${siteBtnGhost} block w-full rounded-lg px-3 py-2 text-left text-sm`}
                    onClick={() => setOpen(false)}
                >
                    {item.label}
                </a>
            ))}
        </div>
    ) : null;

    if (size === "lg") {
        return (
            <div className={`relative ${className}`.trim()} ref={rootRef}>
                <div className="text-sm text-admin-text-secondary">МТС / A1 / life</div>
                <button
                    type="button"
                    onClick={() => setOpen((prev) => !prev)}
                    aria-expanded={open}
                    className="mt-2 block text-left text-2xl font-semibold tracking-tight text-admin-text transition hover:underline"
                >
                    {phoneShortLabel}
                </button>
                {dropdown}
            </div>
        );
    }

    return (
        <div className={`relative ${className}`.trim()} ref={rootRef}>
            <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-admin-border bg-admin-surface px-2.5 py-1.5 text-sm transition hover:border-admin-border-strong hover:bg-admin-muted"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
            >
                <span className="font-semibold text-admin-text">{phoneShortLabel}</span>
                <span className="hidden text-admin-text-secondary sm:inline">МТС / A1 / life</span>
                <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className={`h-3.5 w-3.5 text-admin-text-secondary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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
            {dropdown}
        </div>
    );
}
