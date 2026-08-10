import Link from "next/link";
import type { SiteContent } from "@/lib/site-content-api";
import { formatBelarusDisplay, telHref } from "@/lib/site-contact";
import { siteNavLink } from "@/lib/site-ui-classes";

const INFO_LINKS = [
    { label: "Подарочные сертификаты", href: "/gift-certificates" },
    { label: "Отзывы о магазине", href: "/reviews" },
    { label: "Акции и скидки", href: "/catalog?sale=1" },
] as const;

const EXTRA_LINKS = [
    { label: "Бренды", href: "/brands" },
    { label: "Новости", href: "/news" },
    { label: "Статьи", href: "/articles" },
    { label: "Карта сайта", href: "/sitemap" },
] as const;

type Props = {
    siteContent: SiteContent;
};

export default function Footer({ siteContent: site }: Props) {
    const phones = [
        { label: "МТС", value: site.contact_phone_mts },
        { label: "A1", value: site.contact_phone_a1 },
        { label: "life", value: site.contact_phone_life },
    ];

    const threshold = Number.isFinite(site.delivery_minsk_free_threshold)
        ? site.delivery_minsk_free_threshold
        : 50;

    return (
        <footer className="mt-auto border-t border-admin-border bg-admin-surface">
            <div className="border-b border-admin-border bg-admin-muted/60">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-3 text-center text-sm text-admin-text sm:flex-row sm:px-6 sm:text-left">
                    <span className="font-medium text-admin-text">
                        Бесплатная доставка по Минску от {threshold} BYN
                    </span>
                    <Link
                        href="/catalog"
                        className="text-sm font-medium text-admin-primary underline-offset-4 transition hover:text-admin-primary-hover hover:underline"
                    >
                        Перейти в каталог →
                    </Link>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
                <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="sm:col-span-2 lg:col-span-1">
                        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-admin-text">
                            Perfumer
                        </Link>
                        <p className="mt-3 max-w-xs text-sm leading-relaxed text-admin-text-secondary">
                            Интернет-магазин парфюмерии с доставкой по Беларуси.
                        </p>
                    </div>

                    <div>
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                            Связаться с нами
                        </div>
                        <div className="space-y-2">
                            {phones.map(({ label, value }) => (
                                <a
                                    key={label}
                                    href={telHref(value)}
                                    className="flex items-center gap-2 text-sm text-admin-text transition hover:text-admin-primary"
                                >
                                    <span className="inline-flex shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase leading-none text-admin-text-secondary bg-admin-muted">
                                        {label}
                                    </span>
                                    {formatBelarusDisplay(value)}
                                </a>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                            Информация
                        </div>
                        <nav className="flex flex-col gap-2">
                            {INFO_LINKS.map((item) => (
                                <Link key={item.href + item.label} href={item.href} className={siteNavLink}>
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    <div>
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                            Каталог
                        </div>
                        <nav className="flex flex-col gap-2">
                            {EXTRA_LINKS.map((item) => (
                                <Link key={item.href} href={item.href} className={siteNavLink}>
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                </div>

                <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-admin-border pt-6 text-center text-sm text-admin-text-secondary sm:flex-row sm:text-left">
                    <div>
                        © <span suppressHydrationWarning>{new Date().getFullYear()}</span> Perfumer. Все права защищены.
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-4">
                        <Link href="/sitemap" className={`${siteNavLink} underline-offset-4 hover:underline`}>
                            Карта сайта
                        </Link>
                        <Link href="/contacts" className={`${siteNavLink} underline-offset-4 hover:underline`}>
                            Контакты
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
