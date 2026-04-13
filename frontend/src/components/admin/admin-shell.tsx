"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Menu, X, User, Store, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { useAuth } from "@/components/auth/auth-provider";
import { getRoleLabel } from "@/constants/admin-roles";

type Props = {
    children: ReactNode;
};

const SIDEBAR_STORAGE_KEY = "admin-sidebar-collapsed";

export default function AdminShell({ children }: Props) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarReady, setSidebarReady] = useState(false);

    const { user, logout } = useAuth();
    const accountRef = useRef<HTMLDivElement | null>(null);

    const roleLabel = getRoleLabel(user?.role);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!accountRef.current) return;
            if (!accountRef.current.contains(event.target as Node)) {
                setAccountOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
        setSidebarCollapsed(saved === "1");
        setSidebarReady(true);
    }, []);

    useEffect(() => {
        if (!sidebarReady) {
            return;
        }

        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    }, [sidebarCollapsed, sidebarReady]);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="border-b bg-white">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="hidden items-center justify-center rounded-xl border p-2 text-sm transition hover:bg-gray-50 lg:inline-flex"
                            onClick={() => setSidebarCollapsed((prev) => !prev)}
                            title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
                        >
                            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                        </button>

                        <div className="text-xl font-semibold">Админка</div>
                    </div>

                    <div className="flex items-center gap-3">
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
                            onClick={() => setMobileMenuOpen(true)}
                        >
                            <Menu size={18} />
                            Меню
                        </button>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
                <div
                    className={`grid grid-cols-1 gap-8 lg:h-[calc(100dvh-6.5rem)] ${
                        sidebarCollapsed
                            ? "lg:grid-cols-[92px_minmax(0,1fr)]"
                            : "lg:grid-cols-[280px_minmax(0,1fr)]"
                    }`}
                >
                    <div className="hidden lg:block lg:h-full">
                        <div className="h-full overflow-y-auto pr-1">
                            <AdminSidebar collapsed={sidebarCollapsed} />
                        </div>
                    </div>

                    <section className="min-w-0 pr-1 lg:h-full lg:overflow-y-auto">
                        {children}
                    </section>
                </div>
            </div>

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setMobileMenuOpen(false)}
                    />

                    <div className="absolute left-0 top-0 h-full w-[88%] max-w-sm bg-white p-4 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <div className="text-lg font-semibold">Меню</div>

                            <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mb-4 flex flex-col gap-2 border-b pb-4">
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

                        <div className="h-[calc(100%-180px)] overflow-y-auto">
                            <AdminSidebar onNavigate={() => setMobileMenuOpen(false)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
