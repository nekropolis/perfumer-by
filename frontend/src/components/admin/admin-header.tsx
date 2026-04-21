"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, User, Store, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import AdminActiveTasksWidget from "@/components/admin/admin-active-tasks-widget";
import { useAuth } from "@/components/auth/auth-provider";
import { getRoleLabel } from "@/constants/admin-roles";
import { resetCatalogApiCache } from "@/lib/admin-products-api";

type Props = {
    sidebarCollapsed: boolean;
    onToggleSidebarAction: () => void;
    onOpenMobileMenuAction: () => void;
};

/**
 * Шапка админки.
 *
 * Позиционирование:
 *   - Шапка — обычный блок (`<header>`), НЕ sticky и НЕ fixed.
 *   - Она всегда наверху страницы, потому что её контейнер — `AdminShell`
 *     зафиксирован по высоте вьюпорта и имеет `overflow-hidden`. Шапка
 *     занимает первую flex-строку (flex-none, h-16), и ниже её физически
 *     не существует скролла window — скроллятся только внутренности
 *     main-зоны (сайдбар и секция).
 *
 * На фон шапки намеренно поставлен solid `bg-white`: если сделать полупрозрачный
 * + backdrop-blur, сквозь него начинает просвечивать контент, что легко принять
 * за баг.
 */
export default function AdminHeader({
                                        sidebarCollapsed,
                                        onToggleSidebarAction,
                                        onOpenMobileMenuAction,
                                    }: Props) {
    const { user, logout } = useAuth();
    const [accountOpen, setAccountOpen] = useState(false);
    const [cacheResetBusy, setCacheResetBusy] = useState(false);
    const accountRef = useRef<HTMLDivElement | null>(null);
    const roleLabel = getRoleLabel(user?.role);

    const handleResetCatalogCache = async () => {
        if (cacheResetBusy) return;
        setCacheResetBusy(true);
        try {
            const res = await resetCatalogApiCache();
            if (typeof window !== "undefined") {
                window.alert(res.message || "Кеш каталога сброшен");
            }
        } catch (e) {
            if (typeof window !== "undefined") {
                window.alert(e instanceof Error ? e.message : "Ошибка сброса кеша каталога");
            }
        } finally {
            setCacheResetBusy(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
                setAccountOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <header className="h-16 flex-none border-b bg-white">
            <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="hidden items-center justify-center rounded-xl border p-2 text-sm transition hover:bg-gray-50 lg:inline-flex"
                        onClick={onToggleSidebarAction}
                        title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
                    >
                        {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                    </button>

                    <div className="text-xl font-semibold">Админка</div>
                </div>

                <div className="flex items-center gap-3">
                    <AdminActiveTasksWidget />

                    <button
                        type="button"
                        onClick={() => void handleResetCatalogCache()}
                        disabled={cacheResetBusy}
                        className="hidden items-center gap-2 rounded-xl border px-4 py-2 text-sm transition hover:bg-gray-50 disabled:opacity-60 sm:inline-flex"
                        title="Сбросить кеш"
                    >
                        {cacheResetBusy ? "Сбрасываем кеш..." : "Сбросить кеш"}
                    </button>

                    <a
                        href="/"
                        target="_blank"
                        rel="noreferrer"
                        className="hidden items-center gap-2 rounded-xl border px-4 py-2 text-sm transition hover:bg-gray-50 sm:inline-flex"
                    >
                        <Store size={18} />
                        Магазин
                    </a>

                    <div className="relative hidden sm:block" ref={accountRef}>
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition hover:bg-gray-50"
                            onClick={() => setAccountOpen((prev) => !prev)}
                        >
                            <User size={18} />
                            <span>{user?.name || "Пользователь"}</span>
                        </button>

                        {accountOpen && (
                            <div className="absolute right-0 mt-2 w-56 rounded-2xl border bg-white p-2 shadow-lg">
                                <div className="px-3 py-2">
                                    <div className="text-sm font-medium">
                                        {user?.name || "Пользователь"} - {roleLabel}
                                    </div>
                                    <div className="text-xs text-gray-500">{user?.phone}</div>
                                </div>

                                <div className="my-1 border-t" />

                                <Link
                                    href="/account"
                                    className="block rounded-xl px-3 py-2 text-sm hover:bg-gray-50"
                                    onClick={() => setAccountOpen(false)}
                                >
                                    Личный кабинет
                                </Link>

                                <button
                                    type="button"
                                    className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50"
                                    onClick={() => {
                                        logout();
                                        setAccountOpen(false);
                                    }}
                                >
                                    Выйти
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm lg:hidden"
                        onClick={onOpenMobileMenuAction}
                    >
                        <Menu size={18} />
                        Меню
                    </button>
                </div>
            </div>
        </header>
    );
}
