"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useEffect, useRef, useState, startTransition } from "react";
import { X, Store, User } from "lucide-react";
import AdminHeader from "@/components/admin/admin-header";
import AdminSidebar from "@/components/admin/admin-sidebar";
import AdminActiveTasksWidget from "@/components/admin/admin-active-tasks-widget";
import AdminBynRateControl from "@/components/admin/pricing/admin-byn-rate-control";
import AdminWaitingDiscountDateControl from "@/components/admin/admin-waiting-discount-date-control";
import AdminScrollToTopButton from "@/components/admin/ui/admin-scroll-to-top-button";
import { useAuth } from "@/components/auth/auth-provider";
import { resetCatalogApiCache } from "@/lib/admin-products-api";
import { adminBtnGhost, adminBtnSecondary } from "@/lib/admin-ui-classes";

type Props = {
    children: ReactNode;
};

const SIDEBAR_STORAGE_KEY = "admin-sidebar-collapsed";

export default function AdminShell({ children }: Props) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarReady, setSidebarReady] = useState(false);
    const [cacheResetBusy, setCacheResetBusy] = useState(false);
    const [hasActiveTasks, setHasActiveTasks] = useState(false);
    const mainScrollRef = useRef<HTMLElement>(null);

    const { logout } = useAuth();

    const handleResetCatalogCache = async () => {
        if (cacheResetBusy) return;
        if (
            typeof window !== "undefined" &&
            !window.confirm("Сбросить кеш каталога и прогреть его заново?\n\nПродолжить?")
        ) {
            return;
        }
        setCacheResetBusy(true);
        try {
            const res = await resetCatalogApiCache();
            if (typeof window !== "undefined") {
                const version = res.cache_version != null ? ` (v${res.cache_version})` : "";
                window.alert(`${res.message || "Кеш каталога сброшен"}${version}`);
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

    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyOverflow = body.style.overflow;

        body.classList.add("admin-shell-body");
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";

        return () => {
            body.classList.remove("admin-shell-body");
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prevBodyOverflow;
        };
    }, []);

    return (
        <div
            className="flex h-screen overflow-hidden bg-admin-bg"
            style={{ height: "100dvh" }}
        >
            <div
                className={`hidden min-h-0 shrink-0 overflow-hidden border-r border-admin-border bg-admin-sidebar shadow-admin-sidebar lg:block ${sidebarCollapsed ? "w-[72px]" : "w-[260px]"
                    }`}
            >
                <div className="flex h-full min-h-0 flex-col">
                    <div
                        className={`flex h-14 flex-none items-center border-b border-admin-border bg-admin-sidebar ${sidebarCollapsed ? "justify-center px-2" : "px-5"
                            }`}
                    >
                        {sidebarCollapsed ? (
                            <Image
                                src="/logo-dark.svg"
                                alt="Perfumer"
                                width={934}
                                height={356}
                                className="h-auto w-10 object-contain"
                                unoptimized
                            />
                        ) : (
                            <div className="min-w-0">
                                <Image
                                    src="/logo-dark.svg"
                                    alt="Perfumer"
                                    width={934}
                                    height={356}
                                    className="h-auto w-[128px] object-contain"
                                    unoptimized
                                />
                            </div>
                        )}
                    </div>
                    <div className={`min-h-0 flex-1 overflow-y-auto ${sidebarCollapsed ? "px-2 py-4" : "px-3 py-4"}`}>
                        <AdminSidebar collapsed={sidebarCollapsed} />
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-admin-surface">
                <AdminHeader
                    sidebarCollapsed={sidebarCollapsed}
                    onToggleSidebarAction={() => setSidebarCollapsed((prev) => !prev)}
                    onOpenMobileMenuAction={() => setMobileMenuOpen(true)}
                />

                <main className="min-h-0 flex-1 overflow-hidden">
                    <section ref={mainScrollRef} className="h-full min-h-0 min-w-0 overflow-y-auto">
                        {children}
                    </section>
                </main>
            </div>

            <AdminScrollToTopButton scrollRef={mainScrollRef} />

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-[200] lg:hidden">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
                        onClick={() => {
                            setMobileActionsOpen(false);
                            setMobileMenuOpen(false);
                        }}
                    />

                    <div className="absolute left-0 top-0 flex h-full w-[min(92vw,340px)] flex-col border-r border-admin-border bg-admin-sidebar shadow-2xl">
                        <div className="relative flex flex-none items-center justify-between gap-2 border-b border-admin-border px-4 py-3">
                            <div className="min-w-0 shrink truncate text-sm font-semibold tracking-tight text-admin-text">
                                Меню
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                                <AdminActiveTasksWidget
                                    compact
                                    className="flex items-center gap-2"
                                    onActiveChangeAction={setHasActiveTasks}
                                />
                                <button
                                    type="button"
                                    className={adminBtnGhost}
                                    onClick={() => setMobileActionsOpen((prev) => !prev)}
                                    aria-label="Действия"
                                    title="Действия"
                                >
                                    <User size={18} />
                                </button>
                                <button
                                    type="button"
                                    className={adminBtnGhost}
                                    onClick={() => {
                                        setMobileActionsOpen(false);
                                        setMobileMenuOpen(false);
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {mobileActionsOpen ? (
                                <div className="absolute right-4 top-[calc(100%+0.5rem)] z-[210] w-[min(88vw,22rem)] rounded-xl border border-admin-border bg-admin-surface p-2 shadow-xl">
                                    <div className="flex flex-col gap-1">
                                        {!hasActiveTasks ? (
                                            <AdminBynRateControl
                                                fullWidth
                                                onBeforeOpenAction={() => setMobileActionsOpen(false)}
                                            />
                                        ) : null}

                                        <AdminWaitingDiscountDateControl
                                            fullWidth
                                            className="px-3 py-2"
                                        />

                                        <button
                                            type="button"
                                            onClick={() => void handleResetCatalogCache()}
                                            disabled={cacheResetBusy}
                                            className={`${adminBtnSecondary} w-full disabled:opacity-60`}
                                        >
                                            {cacheResetBusy ? "Сбрасываем кеш..." : "Сбросить кеш"}
                                        </button>

                                        <a
                                            href="/"
                                            target="_blank"
                                            rel="noreferrer"
                                            className={`${adminBtnSecondary} gap-2`}
                                            onClick={() => setMobileMenuOpen(false)}
                                        >
                                            <Store size={18} />
                                            Магазин
                                        </a>

                                        <button
                                            type="button"
                                            className={`${adminBtnSecondary} w-full text-left`}
                                            onClick={() => {
                                                logout();
                                                setMobileMenuOpen(false);
                                            }}
                                        >
                                            Выйти
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
                            <AdminSidebar onNavigateAction={() => setMobileMenuOpen(false)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
