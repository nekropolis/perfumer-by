"use client";

import Link from "next/link";
import { CreditCard, Package, UserRound } from "lucide-react";
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
    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
                <div className="mb-8">
                    <div className="text-sm font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                        Личный кабинет
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
                    <aside className="space-y-4">
                        <section className={`${siteCard} p-5`}>
                            <div className="flex items-center gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-admin-primary text-white">
                                    <UserRound className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                                </div>

                                <div className="min-w-0">
                                    <div className="text-lg font-semibold text-admin-text">Гость</div>
                                    <p className="mt-1 text-sm text-admin-text-secondary">
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

                        <section className="overflow-hidden rounded-xl border border-admin-primary bg-admin-primary p-5 text-white">
                            <div className="text-xs font-medium uppercase tracking-[0.12em] text-white/70">
                                Карта лояльности
                            </div>
                            <div className="mt-3 text-lg font-semibold">Доступна после входа</div>
                            <p className="mt-2 text-sm leading-relaxed text-white/75">
                                Привяжите карту магазина и получайте накопительную скидку на покупки.
                            </p>
                        </section>
                    </aside>

                    <div className="space-y-4">
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
                                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-admin-surface text-admin-primary shadow-sm">
                                            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                                        </span>
                                        <div className="mt-3 text-sm font-semibold text-admin-text">{title}</div>
                                        <p className="mt-1 text-xs leading-relaxed text-admin-text-secondary">{text}</p>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className={`${siteCard} p-5 sm:p-6`}>
                            <div className="text-xs font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                                Заказы
                            </div>
                            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-admin-text">Мои заказы</h2>

                            <div className="mt-6 rounded-xl border border-dashed border-admin-border bg-admin-muted/50 px-6 py-10 text-center">
                                <Package
                                    className="mx-auto h-10 w-10 text-admin-text-muted"
                                    strokeWidth={1.5}
                                    aria-hidden
                                />
                                <p className="mt-4 text-sm font-medium text-admin-text">
                                    Заказы появятся после входа
                                </p>
                                <p className="mt-1 text-sm text-admin-text-secondary">
                                    Оформите покупку на сайте — история подтянется к вашему номеру
                                </p>
                                <Link href="/login" className={`${siteBtnPrimary} mt-5 inline-flex`}>
                                    Войти в аккаунт
                                </Link>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
