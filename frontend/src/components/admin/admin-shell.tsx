"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState, startTransition } from "react";
import { X, Store } from "lucide-react";
import AdminHeader from "@/components/admin/admin-header";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { useAuth } from "@/components/auth/auth-provider";

type Props = {
    children: ReactNode;
};

const SIDEBAR_STORAGE_KEY = "admin-sidebar-collapsed";

/**
 * Каркас админки — три зоны: шапка, сайдбар, контент.
 *
 * Как устроен скролл (и почему это надёжно):
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ outer: height: 100dvh; flex-col; overflow-hidden    │ ← окно НЕ скроллится
 *   │ ┌─────────────────────────────────────────────────┐ │
 *   │ │ <AdminHeader>   flex-none  h-16                 │ │ ← шапка всегда на месте
 *   │ └─────────────────────────────────────────────────┘ │
 *   │ ┌─────────────────────────────────────────────────┐ │
 *   │ │ <main>  flex-1  min-h-0  overflow-hidden        │ │
 *   │ │ ┌──────────┬───────────────────────────────────┐│ │
 *   │ │ │ sidebar  │ content                           ││ │
 *   │ │ │ h-full   │ h-full                            ││ │
 *   │ │ │ overflow │ overflow-y-auto                   ││ │ ← у каждого свой скролл
 *   │ │ │  -y-auto │                                   ││ │
 *   │ │ └──────────┴───────────────────────────────────┘│ │
 *   │ └─────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────┘
 *
 *   • Внешний контейнер фиксирован по высоте вьюпорта (inline-стиль
 *     `height: 100dvh` надёжнее любых Tailwind-классов — не зависит
 *     от того, что у клиента в кэше). `overflow-hidden` физически
 *     запрещает скролл самого окна: шапка никогда не «уезжает».
 *   • `<main>` имеет `flex-1 min-h-0 overflow-hidden` — это ровно остаток
 *     после шапки. `min-h-0` обязателен: без него flex-child не может быть
 *     меньше своего content-size, и `overflow-y-auto` у внуков не сработает.
 *   • Внутри main — grid на 2 колонки (sidebar + content). У каждой
 *     колонки свой `overflow-y-auto`, что и даёт независимый скролл.
 *
 * Мобилка (< lg):
 *   • Сайдбар колонки нет (`hidden lg:block`), сетка становится
 *     одноколоночной, секция занимает всю ширину и скроллится внутри main.
 *   • Сайдбар доступен через overlay по кнопке «Меню» (fixed z-[200]).
 *
 * Модалки:
 *   • Любой компонент внутри `{children}` может рендерить модалки через
 *     портал в `document.body` (обычный паттерн) с `z-[200]`. Они окажутся
 *     выше шапки, потому что шапка рендерится в потоке и z-index у неё
 *     не задан (у contents внутри grid никаких stacking context'ов).
 *   • Важно: на сайдбаре и секции НЕ должно быть `relative z-*` —
 *     любой такой z-index порождает свой stacking context, из-за чего
 *     модалки, отрендеренные изнутри секции без портала, не смогут
 *     перекрыть внешнюю шапку.
 */
export default function AdminShell({ children }: Props) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarReady, setSidebarReady] = useState(false);

    const { logout } = useAuth();

    useEffect(() => {
        const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
        startTransition(() => {
            setSidebarCollapsed(saved === "1");
            setSidebarReady(true);
        });
    }, []);

    useEffect(() => {
        if (!sidebarReady) {
            return;
        }

        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    }, [sidebarCollapsed, sidebarReady]);

    return (
        <div
            className="flex h-screen flex-col overflow-hidden bg-gray-50"
            style={{ height: "100dvh" }}
        >
            <AdminHeader
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebarAction={() => setSidebarCollapsed((prev) => !prev)}
                onOpenMobileMenuAction={() => setMobileMenuOpen(true)}
            />

            <main className="min-h-0 flex-1 overflow-hidden">
                <div className="mx-auto flex h-full max-w-7xl flex-col px-4 py-6 sm:px-6">
                    <div
                        className={`grid min-h-0 flex-1 grid-cols-1 gap-8 ${
                            sidebarCollapsed
                                ? "lg:grid-cols-[92px_minmax(0,1fr)]"
                                : "lg:grid-cols-[280px_minmax(0,1fr)]"
                        }`}
                    >
                        {/*
                          Сайдбар. Скрыт на мобилке (там открывается через оверлей).
                          На lg+ — своя overflow-y-auto колонка.
                        */}
                        <div className="hidden min-h-0 overflow-y-auto pr-1 lg:block">
                            <AdminSidebar collapsed={sidebarCollapsed} />
                        </div>

                        {/*
                          Основной контент. На мобилке — единственная колонка,
                          на lg+ — вторая. Всегда со своим скроллом.
                        */}
                        <section className="min-h-0 min-w-0 overflow-y-auto pr-1">
                            {children}
                        </section>
                    </div>
                </div>
            </main>

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-[200] lg:hidden">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setMobileMenuOpen(false)}
                    />

                    <div className="absolute left-0 top-0 flex h-full w-[88%] max-w-sm flex-col bg-white shadow-2xl">
                        <div className="flex flex-none items-center justify-between border-b p-4">
                            <div className="text-lg font-semibold">Меню</div>

                            <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex flex-none flex-col gap-2 border-b p-4">
                            <a
                                href="/"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
                            >
                                <Store size={18} />
                                Магазин
                            </a>

                            <Link
                                href="/account"
                                className="rounded-xl border px-4 py-3 text-sm"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                Личный кабинет
                            </Link>

                            <button
                                type="button"
                                className="rounded-xl border px-4 py-3 text-left text-sm"
                                onClick={() => {
                                    logout();
                                    setMobileMenuOpen(false);
                                }}
                            >
                                Выйти
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-4">
                            <AdminSidebar onNavigateAction={() => setMobileMenuOpen(false)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
