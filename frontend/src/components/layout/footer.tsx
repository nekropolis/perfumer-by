"use client";

import Link from "next/link";
import { useSiteContent } from "@/components/layout/site-content-context";
import { formatBelarusDisplay, telHref } from "@/lib/site-contact";

export default function Footer() {
    const site = useSiteContent();

    const phones = [
        { label: "МТС", value: site.contact_phone_mts },
        { label: "A1", value: site.contact_phone_a1 },
        { label: "life", value: site.contact_phone_life },
    ];

    return (
        <footer className="border-t border-[var(--line)] bg-[var(--background)]">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">

                {/* GRID */}
                <div className="grid grid-cols-1 gap-10 md:grid-cols-3 text-center md:text-left">

                    {/* 1. Контакты */}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="mb-4 text-sm font-semibold uppercase text-[var(--text-secondary)]">
                            Связаться с нами
                        </div>

                        <div className="space-y-2 text-sm text-[var(--foreground)]">
                            {phones.map(({ label, value }) => (
                                <a key={label} href={telHref(value)} className="block hover:underline">
                                    Perfumer{" "}
                                    <span className="text-[var(--text-secondary)]">{label}</span>{" "}
                                    {formatBelarusDisplay(value)}
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* 2. Информация */}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="mb-4 text-sm font-semibold uppercase text-[var(--text-secondary)]">
                            Информация
                        </div>

                        <div className="flex flex-col gap-2 text-sm text-[var(--foreground)]">
                            <Link href="#" className="hover:underline">
                                Дисконтная программа
                            </Link>
                            <Link href="/gift-certificates" className="hover:underline">
                                Подарочные сертификаты
                            </Link>
                            <Link href="/reviews" className="hover:underline">
                                Отзывы о магазине
                            </Link>
                            <Link href="#" className="hover:underline">
                                О нас
                            </Link>
                            <Link href="#" className="hover:underline">
                                Информация о доставке
                            </Link>
                            <Link href="#" className="hover:underline">
                                Акции и скидки
                            </Link>
                            <Link href="#" className="hover:underline">
                                Наши партнеры
                            </Link>
                        </div>
                    </div>

                    {/* 3. Дополнительно */}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="mb-4 text-sm font-semibold uppercase text-[var(--text-secondary)]">
                            Дополнительно
                        </div>

                        <div className="flex flex-col gap-2 text-sm text-[var(--foreground)]">
                            <Link href="#" className="hover:underline">
                                Производители
                            </Link>
                            <Link href="#" className="hover:underline">
                                Партнёры
                            </Link>
                            <Link href="/sitemap" className="hover:underline">
                                Карта сайта
                            </Link>
                        </div>
                    </div>
                </div>

                {/* BOTTOM */}
                <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[var(--line)] pt-6 text-center text-sm text-[var(--text-secondary)] sm:flex-row sm:text-left">
                    <div>
                        ©{" "}
                        <span suppressHydrationWarning>{new Date().getFullYear()}</span>{" "}
                        Perfumer
                    </div>
                    <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
                        <Link
                            href="/sitemap"
                            className="text-[var(--foreground)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
                        >
                            Карта сайта
                        </Link>
                        <span className="hidden text-[var(--line)] sm:inline">·</span>
                        <span>Все права защищены</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
