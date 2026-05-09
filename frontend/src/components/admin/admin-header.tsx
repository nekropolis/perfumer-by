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
    const clampNationalDigits = useCallback((s: string) => digitsOnly(s).slice(0, 9), [digitsOnly]);
    const nationalFromAnyPhone = (phoneRaw: string) => {
        const digits = digitsOnly(phoneRaw);
        if (digits.startsWith("375")) {
            return digits.slice(3, 12);
        }
        if (digits.length >= 9) {
            return digits.slice(-9);
        }
        return digits.slice(0, 9);
    };
    const formatNationalDisplay = (national: string) => {
        const d = clampNationalDigits(national);
        if (d.length <= 2) return d;
        if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
        if (d.length <= 7) return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5)}`;
        return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5, 7)}-${d.slice(7, 9)}`;
    };
    const fullPhone = `375${clampNationalDigits(quickPhone)}`;
    const showQuickPhoneHits = quickPhoneFocused && clampNationalDigits(quickPhone).length >= 5;

    const openCreateOrderWithPhone = (phoneDigits: string) => {
        const normalized = `375${clampNationalDigits(nationalFromAnyPhone(phoneDigits))}`;
        if (normalized.length < 6) return;
        router.push(`/admin/orders/create?phone=${encodeURIComponent(normalized)}`);
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
                    return (
                        d === want ||
                        after375.startsWith(national) ||
                        d.endsWith(national)
                    );
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
                    <div className="hidden sm:block">
                        <AdminActiveTasksWidget />
                    </div>
                    <div className="relative w-[13.5rem] sm:w-[15.5rem] lg:w-[18rem]" ref={quickPhoneRef}>
                        <div className="flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white">
                            <span className="flex items-center border-r border-gray-200 bg-gray-50 px-2 text-xs text-gray-600">
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
                                className="w-full min-w-0 border-0 px-2 py-2 text-sm outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => openCreateOrderWithPhone(clampNationalDigits(quickPhone))}
                                className="border-l border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                                Найти
                            </button>
                        </div>
                        {showQuickPhoneHits ? (
                            <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                                {quickPhoneHitsLoading ? (
                                    <div className="px-3 py-2 text-xs text-gray-500">Поиск клиентов…</div>
                                ) : quickPhoneHits.length === 0 ? (
                                    <button
                                        type="button"
                                        className="w-full px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50"
                                        onClick={() => openCreateOrderWithPhone(clampNationalDigits(quickPhone))}
                                    >
                                        Клиенты не найдены — создать заказ с этим номером
                                    </button>
                                ) : (
                                    quickPhoneHits.map((u) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                                                onClick={() => openCreateOrderWithPhone(u.phone ?? fullPhone)}
                                        >
                                            <div className="text-sm font-medium text-gray-900">{u.phone || `+${fullPhone}`}</div>
                                            <div className="text-xs text-gray-500">{u.name || "Без имени"}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                        ) : null}
                    </div>

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
                        className="inline-flex items-center rounded-xl border p-2 text-sm lg:hidden"
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
