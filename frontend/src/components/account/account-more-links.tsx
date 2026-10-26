"use client";

import Link from "next/link";
import { HEADER_BURGER_LINKS, HEADER_MAIN_LINKS } from "@/components/layout/header/config";
import { useSiteContent } from "@/components/layout/site-content-context";
import { buildHeaderPhoneDropdown, buildMessengerLinks } from "@/lib/site-contact";
import { siteMenuRow } from "@/lib/site-ui-classes";

const SHOP_LINKS = [
    ...HEADER_MAIN_LINKS.filter((item) => item.href !== "/catalog"),
    ...HEADER_BURGER_LINKS,
] as const;

const tileClass =
    "flex min-h-[4.5rem] items-center justify-center gap-2 rounded-2xl border border-admin-border bg-admin-muted/50 px-3 py-3 text-center text-sm font-medium text-admin-text transition hover:bg-admin-muted active:scale-[0.98]";

type Props = {
    onNavigateAction?: () => void;
    /** Телефоны и мессенджеры — только в мобильном меню. */
    showContacts?: boolean;
};

function openMessenger(appHref: string, webHref: string) {
    window.open(appHref, "_blank", "noopener,noreferrer");
    if (!webHref || webHref === appHref) {
        return;
    }

    window.setTimeout(() => {
        if (document.visibilityState === "visible") {
            window.open(webHref, "_blank", "noopener,noreferrer");
        }
    }, 450);
}

/** Ссылки бывшего мобильного меню. */
export default function AccountMoreLinks({ onNavigateAction, showContacts = false }: Props) {
    const site = useSiteContent();
    const phones = buildHeaderPhoneDropdown(site);
    const messengers = buildMessengerLinks(site).filter((item) => item.appHref);

    return (
        <section className="md:hidden">
            <nav className="grid grid-cols-2 gap-2" aria-label="Разделы магазина">
                {SHOP_LINKS.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={tileClass}
                        onClick={() => {
                            if (item.href === window.location.pathname + window.location.search) {
                                onNavigateAction?.();
                            }
                        }}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>
            {showContacts && phones.length > 0 ? (
                <div className="mt-3 border-t border-admin-border pt-2">
                    <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                        Телефоны
                    </div>
                    {phones.map((phone) => (
                        <a key={phone.href} href={phone.href} className={siteMenuRow}>
                            {phone.label}
                        </a>
                    ))}
                </div>
            ) : null}
            {showContacts && messengers.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                    {messengers.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={tileClass}
                            onClick={() => openMessenger(item.appHref, item.webHref)}
                        >
                            {item.id === "telegram" ? (
                                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
                                    <path d="M21.944 4.256a1.5 1.5 0 0 0-1.74-.275L3.25 11.34a1.5 1.5 0 0 0 .147 2.786l4.441 1.474 1.468 4.62a1.5 1.5 0 0 0 2.648.49l2.472-3.235 4.387 3.216a1.5 1.5 0 0 0 2.335-.876l2.97-14.027a1.5 1.5 0 0 0-.174-1.232ZM10.7 14.553l-.58 3.363-.83-2.612L16.9 8.17l-6.2 6.383Z" />
                                </svg>
                            ) : (
                                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
                                    <path d="M20.75 14.37c-.22-.18-1.3-.95-1.5-1.02-.2-.08-.35-.11-.5.11-.14.22-.58.73-.71.88-.13.15-.26.17-.48.06-.22-.11-.93-.34-1.78-1.08-.66-.58-1.1-1.3-1.23-1.52-.13-.22-.01-.34.1-.45.1-.1.22-.26.34-.39.11-.13.14-.22.22-.37.07-.15.04-.28-.02-.39-.06-.11-.5-1.2-.69-1.64-.18-.43-.37-.37-.5-.38h-.43c-.15 0-.39.06-.59.28-.2.22-.77.75-.77 1.84 0 1.1.79 2.16.9 2.31.11.15 1.56 2.4 3.78 3.37 2.23.97 2.23.65 2.63.61.39-.04 1.3-.53 1.49-1.04.18-.5.18-.94.13-1.03-.06-.08-.2-.13-.42-.24ZM12.02 2C6.5 2 2 6.34 2 11.68c0 2.2.77 4.21 2.06 5.8L3 22l4.8-1.02a10.2 10.2 0 0 0 4.22.91c5.52 0 10.02-4.34 10.02-9.68S17.54 2 12.02 2Zm0 17.64c-1.3 0-2.57-.31-3.7-.89l-.26-.13-2.85.6.61-2.74-.17-.28a7.2 7.2 0 0 1-1.13-3.87c0-4 3.39-7.26 7.5-7.26 4.14 0 7.52 3.26 7.52 7.26 0 4.01-3.38 7.3-7.52 7.3Z" />
                                </svg>
                            )}
                            {item.id === "telegram" ? "Telegram" : "Viber"}
                        </button>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
