"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { usePathname, useRouter } from "next/navigation";
import { Menu, User, Store, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import AdminActiveTasksWidget from "@/components/admin/admin-active-tasks-widget";
import { useAuth } from "@/components/auth/auth-provider";
import { getRoleLabel } from "@/constants/admin-roles";
import { resetCatalogApiCache } from "@/lib/admin-products-api";
import { fetchAdminUsers, type AdminUser } from "@/lib/admin-users-api";
import { clampBelarusNationalDigits } from "@/lib/belarus-phone-national";
import { adminBtnSecondary } from "@/lib/admin-ui-classes";

type Props = {
    sidebarCollapsed: boolean;
    onToggleSidebarAction: () => void;
    onOpenMobileMenuAction: () => void;
};

export default function AdminHeader({
    sidebarCollapsed,
    onToggleSidebarAction,
    onOpenMobileMenuAction,
}: Props) {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [accountOpen, setAccountOpen] = useState(false);
    const [cacheResetBusy, setCacheResetBusy] = useState(false);
    const [quickPhone, setQuickPhone] = useState("");
    const [quickPhoneFocused, setQuickPhoneFocused] = useState(false);
    const [quickPhoneHitsLoading, setQuickPhoneHitsLoading] = useState(false);
    const [quickPhoneHits, setQuickPhoneHits] = useState<AdminUser[]>([]);
    const accountRef = useRef<HTMLDivElement | null>(null);
    const quickPhoneRef = useRef<HTMLDivElement | null>(null);
    const roleLabel = getRoleLabel(user?.role);
    const debouncedQuickPhone = useDebouncedValue(quickPhone, 250);

    const digitsOnly = useCallback((s: string) => s.replace(/\D+/g, ""), []);
    const clampNationalDigits = useCallback((s: string) => clampBelarusNationalDigits(s), []);
    const formatNationalDisplay = (national: string) => {
        const d = clampNationalDigits(national);
        if (d.length <= 2) return d;
        if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
        if (d.length <= 7) return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5)}`;
        return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5, 7)}-${d.slice(7, 9)}`;
    };
    const fullPhone = `375${clampNationalDigits(quickPhone)}`;
    const showQuickPhoneHits = quickPhoneFocused && clampNationalDigits(quickPhone).length >= 5;

    const getCreateOrderHref = (phoneDigits: string) => {
        const national = clampNationalDigits(phoneDigits);
        if (!national) {
            return "/admin/orders/create";
        }
        return `/admin/orders/create?phone=${encodeURIComponent(`375${national}`)}`;
    };

    const openCreateOrderWithPhone = (phoneDigits: string) => {
        router.push(getCreateOrderHref(phoneDigits));
        setQuickPhoneFocused(false);
    };

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
            if (quickPhoneRef.current && !quickPhoneRef.current.contains(event.target as Node)) {
                setQuickPhoneFocused(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const national = clampNationalDigits(debouncedQuickPhone);
        if (national.length < 5) {
            setQuickPhoneHits([]);
            return;
        }
        let cancelled = false;
        setQuickPhoneHitsLoading(true);
        void fetchAdminUsers({ search: `375${national}` })
            .then((response) => {
                if (cancelled) return;
                const want = `375${national}`;
                const rows = (response.data ?? []).filter((u) => {
                    const d = digitsOnly(u.phone ?? "");
                    if (!d || national.length === 0) {
                        return false;
                    }
                    const after375 = d.startsWith("375") ? d.slice(3) : d;
                    return d === want || after375.startsWith(national) || d.endsWith(national);
                });
                setQuickPhoneHits(rows.slice(0, 6));
            })
            .catch(() => {
                if (!cancelled) setQuickPhoneHits([]);
            })
            .finally(() => {
                if (!cancelled) setQuickPhoneHitsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [clampNationalDigits, debouncedQuickPhone, digitsOnly]);

    useEffect(() => {
        setQuickPhone("");
        setQuickPhoneHits([]);
        setQuickPhoneFocused(false);
    }, [pathname]);

    return (
        <header className="h-14 flex-none border-b border-admin-border bg-admin-surface shadow-[0_12px_28px_-28px_rgba(31,23,34,0.5)]">
            <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        type="button"
                        className="hidden rounded-full border border-admin-border bg-admin-surface p-2 text-admin-text-secondary transition hover:border-admin-border-strong hover:bg-admin-muted hover:text-admin-text lg:inline-flex"
                        onClick={onToggleSidebarAction}
                        title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
                    >
                        {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                    </button>

                    <div className="relative w-[calc(100vw-5rem)] max-w-[24rem] sm:w-[24rem] lg:w-[26rem] lg:max-w-none" ref={quickPhoneRef}>
                        <div className="flex items-stretch overflow-hidden rounded-lg border border-admin-border bg-admin-muted shadow-sm">
                            <span className="flex items-center border-r border-admin-border px-2 text-xs text-admin-text-secondary">
                                +375
                            </span>
                            <input
                                value={formatNationalDisplay(quickPhone)}
                                onChange={(e) => setQuickPhone(clampNationalDigits(e.target.value))}
                                onFocus={() => setQuickPhoneFocused(true)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        openCreateOrderWithPhone(clampNationalDigits(quickPhone));
                                    }
                                }}
                                placeholder="29 123-45-67"
                                inputMode="numeric"
                                autoComplete="new-password"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                className="w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm text-admin-text outline-none placeholder:text-admin-text-muted"
                            />
                            <button
                                type="button"
                                onClick={() => openCreateOrderWithPhone(clampNationalDigits(quickPhone))}
                                className="hidden shrink-0 border-l border-admin-border px-2.5 py-1.5 text-xs font-medium text-admin-text-secondary transition hover:bg-admin-surface hover:text-admin-text sm:inline-flex"
                            >
                                Найти
                            </button>
                            <Link
                                href={getCreateOrderHref(quickPhone)}
                                onClick={() => setQuickPhoneFocused(false)}
                                className="inline-flex shrink-0 items-center justify-center border-l border-admin-border bg-admin-primary px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-admin-primary-hover sm:px-3"
                            >
                                <span className="sm:hidden">+ Заказ</span>
                                <span className="hidden sm:inline">+ Создать заказ</span>
                            </Link>
                        </div>
                        {showQuickPhoneHits ? (
                            <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-admin-border bg-admin-surface py-1 shadow-lg">
                                {quickPhoneHitsLoading ? (
                                    <div className="px-3 py-2 text-xs text-admin-text-secondary">
                                        Поиск клиентов…
                                    </div>
                                ) : quickPhoneHits.length === 0 ? (
                                    <button
                                        type="button"
                                        className="w-full px-3 py-2 text-left text-xs text-admin-text-secondary hover:bg-admin-muted"
                                        onClick={() => openCreateOrderWithPhone(clampNationalDigits(quickPhone))}
                                    >
                                        Клиенты не найдены — создать заказ с этим номером
                                    </button>
                                ) : (
                                    quickPhoneHits.map((u) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            className="block w-full px-3 py-2 text-left hover:bg-admin-muted"
                                            onClick={() => openCreateOrderWithPhone(u.phone ?? fullPhone)}
                                        >
                                            <div className="text-sm font-medium text-admin-text">
                                                {u.phone || `+${fullPhone}`}
                                            </div>
                                            <div className="text-xs text-admin-text-secondary">
                                                {u.name || "Без имени"}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    <div className="hidden sm:block">
                        <AdminActiveTasksWidget />
                    </div>

                    <button
                        type="button"
                        onClick={() => void handleResetCatalogCache()}
                        disabled={cacheResetBusy}
                        className={`${adminBtnSecondary} hidden sm:inline-flex disabled:opacity-60`}
                        title="Сбросить кеш"
                    >
                        {cacheResetBusy ? "Сбрасываем..." : "Сбросить кеш"}
                    </button>

                    <a
                        href="/"
                        target="_blank"
                        rel="noreferrer"
                        className={`${adminBtnSecondary} hidden gap-2 sm:inline-flex`}
                    >
                        <Store size={18} />
                        Магазин
                    </a>

                    <div className="relative hidden sm:block" ref={accountRef}>
                        <button
                            type="button"
                            className={`${adminBtnSecondary} gap-2`}
                            onClick={() => setAccountOpen((prev) => !prev)}
                        >
                            <User size={18} />
                            <span className="max-w-[8rem] truncate">{user?.name || "Пользователь"}</span>
                        </button>

                        {accountOpen && (
                            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-admin-border bg-admin-surface p-2 shadow-lg">
                                <div className="px-3 py-2">
                                    <div className="text-sm font-medium text-admin-text">
                                        {user?.name || "Пользователь"} — {roleLabel}
                                    </div>
                                    <div className="text-xs text-admin-text-secondary">{user?.phone}</div>
                                </div>

                                <div className="my-1 border-t border-admin-border" />

                                <Link
                                    href="/account"
                                    className="block rounded-lg px-3 py-2 text-sm text-admin-text hover:bg-admin-muted"
                                    onClick={() => setAccountOpen(false)}
                                >
                                    Личный кабинет
                                </Link>

                                <button
                                    type="button"
                                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-admin-text hover:bg-admin-muted"
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
                        className="inline-flex rounded-full border border-admin-border bg-admin-surface p-2 text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text lg:hidden"
                        onClick={onOpenMobileMenuAction}
                        aria-label="Открыть меню"
                        title="Открыть меню"
                    >
                        <Menu size={18} />
                    </button>
                </div>
            </div>
        </header>
    );
}
