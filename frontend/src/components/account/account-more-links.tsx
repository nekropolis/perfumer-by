"use client";

import Link from "next/link";
import { HEADER_BURGER_LINKS, HEADER_MAIN_LINKS } from "@/components/layout/header/config";
import { useSiteContent } from "@/components/layout/site-content-context";
import { buildHeaderPhoneDropdown } from "@/lib/site-contact";
import { siteCard, siteMenuRow } from "@/lib/site-ui-classes";

const SHOP_LINKS = [
    ...HEADER_MAIN_LINKS.filter((item) => item.href !== "/catalog"),
    ...HEADER_BURGER_LINKS,
] as const;

type Props = {
    onNavigateAction?: () => void;
};

/** Ссылки бывшего мобильного меню. */
export default function AccountMoreLinks({ onNavigateAction }: Props) {
    const site = useSiteContent();
    const phones = buildHeaderPhoneDropdown(site);

    return (
        <section className={`${siteCard} p-2 md:hidden`}>
            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                Ещё
            </div>
            <nav className="flex flex-col" aria-label="Разделы магазина">
                {SHOP_LINKS.map((item) => (
                    <Link key={item.href} href={item.href} className={siteMenuRow} onClick={onNavigateAction}>
                        {item.label}
                    </Link>
                ))}
            </nav>
            {phones.length > 0 ? (
                <div className="mt-1 border-t border-admin-border px-1 pt-2">
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
        </section>
    );
}
