"use client";

import Link from "next/link";
import { BookOpen, Flame, Gem, MapPin, Newspaper, Phone, Sparkles, Star, type LucideIcon } from "lucide-react";
import { HEADER_BURGER_LINKS, HEADER_MAIN_LINKS } from "@/components/layout/header/config";
import { useSiteContent } from "@/components/layout/site-content-context";
import { buildHeaderPhoneDropdown, buildMessengerLinks } from "@/lib/site-contact";

const SHOP_LINKS = [
    ...HEADER_MAIN_LINKS.filter((item) => item.href !== "/catalog"),
    ...HEADER_BURGER_LINKS,
] as const;

const MENU_ICONS: Record<string, LucideIcon> = {
    "/brands": Gem,
    "/catalog?new=1": Sparkles,
    "/catalog?hit=1": Flame,
    "/news": Newspaper,
    "/articles": BookOpen,
    "/reviews": Star,
    "/contacts": MapPin,
};

/** Прежние фото. Откат: MENU_IMAGE_SET = "stock". Файлы не удалять. */
const MENU_IMAGES_STOCK: Record<string, string> = {
    "/brands": "/home/hero-perfume-v2.webp",
    "/catalog?new=1": "/home/promos/promo-new.webp",
    "/catalog?hit=1": "/home/promos/promo-seasonal.webp",
    "/news": "/home/categories/category-sets.webp",
    "/articles": "/home/categories/category-testers.webp",
    "/reviews": "/home/categories/category-female.webp",
    "/contacts": "/home/categories/category-male.webp",
};

const MENU_IMAGES_THEMED: Record<string, string> = {
    "/brands": "/home/menu/brands.jpg",
    "/catalog?new=1": "/home/menu/new.jpg",
    "/catalog?hit=1": "/home/menu/hits.jpg",
    "/news": "/home/menu/news.jpg",
    "/articles": "/home/menu/articles.jpg",
    "/reviews": "/home/menu/reviews.jpg",
    "/contacts": "/home/menu/contacts.jpg",
};

const MENU_IMAGE_SET = "themed" as "stock" | "themed";
const MENU_IMAGES = MENU_IMAGE_SET === "themed" ? MENU_IMAGES_THEMED : MENU_IMAGES_STOCK;

/** Кадр справа от подписи: масштаб и точка, чтобы предмет не уходил под текст. */
const MENU_IMAGE_FRAME: Record<string, { size: string; position: string }> = {
    "/brands": { size: "auto 128%", position: "right 36%" },
    "/catalog?new=1": { size: "auto 128%", position: "right 22%" },
    "/catalog?hit=1": { size: "auto 128%", position: "right 32%" },
    "/news": { size: "auto 128%", position: "right 46%" },
    "/articles": { size: "auto 128%", position: "right 40%" },
    "/reviews": { size: "210% auto", position: "6% 42%" },
    "/contacts": { size: "auto 128%", position: "right 58%" },
};

const CONTACT_BRAND: Record<string, string> = {
    МТС: "#E30613",
    A1: "#1A1A1A",
    life: "#6B2C91",
    telegram: "#2AABEE",
    viber: "#7360F2",
};

const contactCardClass =
    "relative flex overflow-hidden rounded-2xl border border-admin-border bg-admin-surface shadow-sm transition active:scale-[0.98]";

const tileClass =
    "relative flex min-h-[5.75rem] items-center overflow-hidden rounded-2xl border border-admin-border bg-admin-surface px-3 text-left text-sm font-semibold text-admin-text shadow-sm transition active:scale-[0.98]";

type Props = {
    onNavigateAction?: () => void;
    /** Телефоны и мессенджеры — только в мобильном меню. */
    showContacts?: boolean;
};

function splitPhoneLabel(label: string): { operator: string; number: string } {
    const splitAt = label.indexOf(": ");
    if (splitAt === -1) {
        return { operator: label, number: "" };
    }

    return {
        operator: label.slice(0, splitAt),
        number: label.slice(splitAt + 2).replace(/^\+375\s*/, ""),
    };
}

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
                {SHOP_LINKS.map((item) => {
                    const Icon = MENU_ICONS[item.href] ?? Sparkles;
                    const image = MENU_IMAGES[item.href] ?? "/home/hero-perfume-v2.webp";

                    return (
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
                            <span
                                aria-hidden
                                className="absolute inset-0 bg-no-repeat"
                                style={{
                                    backgroundImage: `url(${image})`,
                                    backgroundSize: MENU_IMAGE_FRAME[item.href]?.size ?? "auto 128%",
                                    backgroundPosition: MENU_IMAGE_FRAME[item.href]?.position ?? "right 42%",
                                }}
                            />
                            <span
                                aria-hidden
                                className="absolute inset-y-0 left-0 w-[78%] bg-gradient-to-r from-admin-surface from-50% via-admin-surface/94 to-transparent"
                            />
                            <span className="relative z-[1] inline-flex items-center gap-2">
                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-admin-text shadow-sm ring-1 ring-black/5">
                                    <Icon className="h-4 w-4" aria-hidden />
                                </span>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </nav>
            {showContacts && phones.length > 0 ? (
                <div className="mt-6 grid grid-cols-3 gap-2">
                    {phones.map((phone) => {
                        const { operator, number } = splitPhoneLabel(phone.label);
                        const brandClass = CONTACT_BRAND[operator];

                        return (
                            <a
                                key={phone.href}
                                href={phone.href}
                                aria-label={`Позвонить ${phone.label}`}
                                className={`${contactCardClass} min-h-14 flex-col items-center justify-center gap-1 px-1.5 py-2 text-center`}
                            >
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-y-0 right-0 w-1/2"
                                    style={{ background: brandClass ? `linear-gradient(to left, ${brandClass}26, transparent)` : undefined }}
                                />
                                <span className="relative z-[1] inline-flex items-center gap-1 text-[11px] font-semibold text-admin-text">
                                    <span
                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white"
                                        style={{ backgroundColor: brandClass ?? "#737373" }}
                                    >
                                        <Phone className="h-3 w-3" aria-hidden />
                                    </span>
                                    {operator}
                                </span>
                                <span className="relative z-[1] text-[11px] font-semibold leading-none tracking-tight text-admin-text">
                                    {number || phone.label}
                                </span>
                            </a>
                        );
                    })}
                </div>
            ) : null}
            {showContacts && messengers.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                    {messengers.map((item) => {
                        const brand = CONTACT_BRAND[item.id] ?? "#737373";

                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={`${contactCardClass} min-h-14 items-center gap-2 px-3 text-left text-sm font-semibold text-admin-text`}
                                onClick={() => openMessenger(item.appHref, item.webHref)}
                            >
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-y-0 right-0 w-[48%]"
                                    style={{ background: `linear-gradient(to left, ${brand}26, transparent)` }}
                                />
                                <span
                                    className="relative z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                                    style={{ backgroundColor: brand }}
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
                                </span>
                                <span className="relative z-[1]">{item.id === "telegram" ? "Telegram" : "Viber"}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}
