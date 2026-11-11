"use client";

import Link from "next/link";
import { CreditCard, Heart, Package, UserRound } from "lucide-react";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

const benefits = [
    {
        icon: Package,
        title: "История заказов",
        text: "Статусы, детали и суммы — всё в личном кабинете",
    },
    {
        icon: UserRound,
        title: "Профиль",
        text: "Имя, email и дата рождения подставятся при оформлении",
    },
    {
        icon: CreditCard,
        title: "Карта лояльности",
        text: "Привяжите карту и получайте накопительную скидку",
    },
] as const;

export default function AccountGuestView() {
    const { wishlistQty, loading: wishlistLoading } = useWishlist();

    return (
        <main className="bg-admin-bg text-admin-text md:min-h-screen">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[340px_1fr] lg:items-start lg:gap-6">
                    <Link
                        href="/wishlist"
                        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-admin-border bg-admin-surface px-3 text-sm font-medium text-admin-text md:hidden"
                    >
                        <Heart className="h-5 w-5 shrink-0" aria-hidden />
                        Избранное
                        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-admin-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-admin-text">
                            {wishlistLoading ? "…" : wishlistQty}
                        </span>
                    </Link>

                    <section className={`${siteCard} p-5`}>
                        <div className="flex items-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-admin-primary text-white">
                                <UserRound className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                            </div>

                            <div className="min-w-0">
                                <div className="text-lg font-semibold text-admin-text">Гость</div>
                                <p className="mt-2 text-sm text-admin-text-secondary">
                                    Войдите, чтобы открыть профиль
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col gap-2">
                            <Link href="/login" className={`${siteBtnPrimary} w-full`}>
                                Войти
                            </Link>
                            <Link href="/login?tab=register" className={`${siteBtnSecondary} w-full`}>
                                Создать аккаунт
                            </Link>
                        </div>
                    </section>

                    <section className={`${siteCard} p-5 sm:p-6`}>
                        <div className="text-xs font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                            Возможности
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-admin-text">Ваш личный кабинет</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-admin-text-secondary">
                            Авторизация по номеру телефона и паролю. После входа откроются
                            заказы, профиль и карта лояльности.
                        </p>

                        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                            {benefits.map(({ icon: Icon, title, text }) => (
                                <li key={title} className="rounded-xl bg-admin-muted p-4">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-admin-surface text-admin-primary shadow-sm">
                                        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                                    </span>
                                    <div className="mt-3 text-sm font-semibold text-admin-text">{title}</div>
                                    <p className="mt-1 text-xs leading-relaxed text-admin-text-secondary">{text}</p>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>
        </main>
    );
}
