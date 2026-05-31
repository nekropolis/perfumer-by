"use client";

import Link from "next/link";
import { CreditCard, Package, UserRound } from "lucide-react";

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
        <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
                <div className="mb-8">
                    <div className="text-sm font-medium uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                        Личный кабинет
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
                    <aside className="space-y-5">
                        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_24px_70px_rgba(31,23,34,0.06)]">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--background)] shadow-lg">
                                    <UserRound className="h-8 w-8" strokeWidth={1.75} aria-hidden />
                                </div>

                                <div className="min-w-0">
                                    <div className="text-lg font-semibold text-[var(--foreground)]">Гость</div>
                                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                        Войдите, чтобы открыть профиль
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-col gap-2">
                                <Link
                                    href="/login"
                                    className="flex w-full items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
                                >
                                    Войти
                                </Link>
                                <Link
                                    href="/login?tab=register"
                                    className="flex w-full items-center justify-center rounded-2xl border border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background)]"
                                >
                                    Создать аккаунт
                                </Link>
                            </div>
                        </section>

                        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--accent-hover)] to-[var(--accent)] p-5 text-[var(--background)] shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
                            <div className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--background)]/60">
                                Карта лояльности
                            </div>
                            <div className="mt-4 text-lg font-semibold">Доступна после входа</div>
                            <p className="mt-2 text-sm leading-relaxed text-[var(--background)]/75">
                                Привяжите карту магазина и получайте накопительную скидку на покупки.
                            </p>
                        </section>
                    </aside>

                    <div className="space-y-6">
                        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_70px_rgba(31,23,34,0.06)]">
                            <div className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                                Возможности
                            </div>
                            <h1 className="mt-2 font-display text-2xl font-semibold">Ваш личный кабинет</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
                                Авторизация по номеру телефона и паролю. После входа откроются
                                заказы, профиль и карта лояльности.
                            </p>

                            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                                {benefits.map(({ icon: Icon, title, text }) => (
                                    <li
                                        key={title}
                                        className="rounded-2xl bg-[var(--background)] p-4"
                                    >
                                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)]/50 text-[var(--accent)]">
                                            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                                        </span>
                                        <div className="mt-3 text-sm font-semibold">{title}</div>
                                        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{text}</p>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_70px_rgba(31,23,34,0.06)]">
                            <div className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                                Заказы
                            </div>
                            <h2 className="mt-2 font-display text-2xl font-semibold">Мои заказы</h2>

                            <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--background)] px-6 py-10 text-center">
                                <Package
                                    className="mx-auto h-10 w-10 text-[var(--text-secondary)]/50"
                                    strokeWidth={1.5}
                                    aria-hidden
                                />
                                <p className="mt-4 text-sm font-medium text-[var(--foreground)]">
                                    Заказы появятся после входа
                                </p>
                                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                    Оформите покупку на сайте или в магазине — история подтянется к вашему номеру
                                </p>
                                <Link
                                    href="/login"
                                    className="mt-5 inline-flex rounded-2xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
                                >
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
