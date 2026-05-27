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
import {
    fetchAdminOrderCustomerContext,
    type AdminOrderCustomerContext,
} from "@/lib/admin-orders-api";
import { fetchAdminUsers, type AdminUser } from "@/lib/admin-users-api";
import { clampBelarusNationalDigits } from "@/lib/belarus-phone-national";
import { adminBtnSecondary } from "@/lib/admin-ui-classes";

type Props = {
    sidebarCollapsed: boolean;
    onToggleSidebarAction: () => void;
    onOpenMobileMenuAction: () => void;
};

function phoneDigitsOnly(phone: string): string {
    return phone.replace(/\D+/g, "");
}

function isExactQuickPhoneMatch(userPhone: string, fullPhone: string, national: string): boolean {
    const digits = phoneDigitsOnly(userPhone);
    const want = phoneDigitsOnly(fullPhone);
    if (!digits || !want) {
        return false;
    }
    if (digits === want) {
        return true;
    }
    return national.length === 9 && digits.endsWith(national);
}

function QuickPhoneUserHitSummary({ user }: { user: AdminUser }) {
    const count = Number(user.orders_count ?? 0);
    const card = user.discount_cards?.[0];
    if (count <= 0 && !card) {
        return null;
    }

    return (
        <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-admin-text-secondary">
            {count > 0 ? <p>заказов: {count}</p> : null}
            {card ? (
                <p>
                    Карта <span className="font-mono text-admin-text">{card.number}</span>{" "}
                    <span className="font-semibold text-admin-primary">−{card.discount_percent}%</span>
                </p>
            ) : null}
        </div>
    );
}

function QuickPhoneOrdersSummary({ context }: { context: AdminOrderCustomerContext }) {
    const { completed, active, cancelled } = context.orders;
    const total = completed + active + cancelled;
    if (total <= 0) {
        return (
            <p className="mt-1 text-[11px] leading-snug text-admin-text-secondary">Заказов по этому номеру нет</p>
        );
    }

    const segments: { text: string; className?: string }[] = [];
    if (completed > 0) {
        segments.push({ text: `выполнено ${completed}`, className: "text-emerald-700" });
    }
    if (active > 0) {
        segments.push({ text: `активных ${active}`, className: "text-sky-700" });
    }
    if (cancelled > 0) {
        segments.push({ text: `отменено ${cancelled}` });
    }

    return (
        <div className="mt-1 space-y-0.5 text-[11px] leading-snug">
            <p className="text-admin-text-secondary">
                {segments.map((segment, index) => (
                    <span key={segment.text}>
                        {index > 0 ? " · " : null}
                        <span className={segment.className}>{segment.text}</span>
                    </span>
                ))}
                <span> · всего {total}</span>
            </p>
            {context.discount_cards.length > 0 ? (
                <p className="text-admin-text-secondary">
                    Карта{" "}
                    <span className="font-mono text-admin-text">{context.discount_cards[0].number}</span>
                    {" "}
                    <span className="font-semibold text-admin-primary">
                        −{context.discount_cards[0].discount_percent}%
                    </span>
                </p>
            ) : null}
        </div>
    );
}

type QuickPhoneCustomerOptionProps = {
    title: string;
    phoneLine: string;
    badge?: "В базе" | "Гость" | null;
    context: AdminOrderCustomerContext | null;
    showFullOrders: boolean;
    userHit?: AdminUser;
    onClick: () => void;
};

function QuickPhoneCustomerOption({
    title,
    phoneLine,
    badge,
    context,
    showFullOrders,
    userHit,
    onClick,
}: QuickPhoneCustomerOptionProps) {
    return (
        <button
            type="button"
            className="block w-full border-b border-admin-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-admin-muted"
            onClick={onClick}
        >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-admin-text">{title}</span>
                {badge ? (
                    <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            badge === "В базе"
                                ? "bg-admin-primary/12 text-admin-primary"
                                : "bg-amber-100/90 text-amber-900"
                        }`}
                    >
                        {badge}
                    </span>
                ) : null}
            </div>
            <div className="text-xs text-admin-text-secondary">{phoneLine}</div>
            {showFullOrders && context ? <QuickPhoneOrdersSummary context={context} /> : null}
            {userHit && !showFullOrders ? <QuickPhoneUserHitSummary user={userHit} /> : null}
        </button>
    );
}

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
    const [quickPhoneContext, setQuickPhoneContext] = useState<AdminOrderCustomerContext | null>(null);
    const [quickPhoneContextLoading, setQuickPhoneContextLoading] = useState(false);
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
    const nationalDigits = clampNationalDigits(quickPhone);
    const fullPhone = `375${nationalDigits}`;
    const showQuickPhoneHits = quickPhoneFocused && nationalDigits.length >= 5;

    const quickPhoneOrdersCount = quickPhoneContext
        ? quickPhoneContext.orders.completed +
          quickPhoneContext.orders.cancelled +
          quickPhoneContext.orders.active
        : 0;
    const quickPhoneSuggestedName =
        quickPhoneContext?.matched_user?.name?.trim() ||
        quickPhoneContext?.customer_name?.trim() ||
        "";

    const getCreateOrderHref = (phoneDigits: string, customerName?: string) => {
        const national = clampNationalDigits(phoneDigits);
        if (!national) {
            return "/admin/orders/create";
        }
        const params = new URLSearchParams();
        params.set("phone", `375${national}`);
        const name = customerName?.trim();
        if (name) {
            params.set("name", name);
        }
        return `/admin/orders/create?${params.toString()}`;
    };

    const openCreateOrderWithPhone = (phoneDigits: string, customerName?: string) => {
        router.push(getCreateOrderHref(phoneDigits, customerName));
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
        const national = clampNationalDigits(debouncedQuickPhone);
        if (national.length < 9) {
            setQuickPhoneContext(null);
            setQuickPhoneContextLoading(false);
            return;
        }
        let cancelled = false;
        setQuickPhoneContextLoading(true);
        void fetchAdminOrderCustomerContext(`375${national}`)
            .then((response) => {
                if (!cancelled) setQuickPhoneContext(response.data);
            })
            .catch(() => {
                if (!cancelled) setQuickPhoneContext(null);
            })
            .finally(() => {
                if (!cancelled) setQuickPhoneContextLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [clampNationalDigits, debouncedQuickPhone]);

    useEffect(() => {
        setQuickPhone("");
        setQuickPhoneHits([]);
        setQuickPhoneContext(null);
        setQuickPhoneFocused(false);
    }, [pathname]);

    return (
        <header className="h-14 flex-none border-b border-admin-border bg-admin-header shadow-admin-header">
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
                        <div className="flex items-stretch overflow-hidden rounded-lg border border-admin-border bg-admin-surface shadow-sm">
                            <span className="flex items-center border-r border-admin-border bg-admin-muted px-2.5 text-xs font-medium text-admin-text-secondary">
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
                                href={getCreateOrderHref(quickPhone, quickPhoneSuggestedName)}
                                onClick={() => setQuickPhoneFocused(false)}
                                className="inline-flex shrink-0 items-center justify-center border-l border-admin-border bg-admin-primary px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-admin-primary-hover sm:px-3"
                            >
                                <span className="sm:hidden">+ Заказ</span>
                                <span className="hidden sm:inline">+ Создать заказ</span>
                            </Link>
                        </div>
                        {showQuickPhoneHits ? (
                            <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-admin-border bg-admin-surface py-0 shadow-lg">
                                {quickPhoneHitsLoading ||
                                (nationalDigits.length >= 9 && quickPhoneContextLoading) ? (
                                    <div className="px-3 py-2 text-xs text-admin-text-secondary">
                                        Поиск клиентов…
                                    </div>
                                ) : (() => {
                                    const showOrdersContext =
                                        nationalDigits.length >= 9 &&
                                        quickPhoneContext != null &&
                                        quickPhoneOrdersCount > 0;
                                    const exactHitInList = quickPhoneHits.some((u) =>
                                        isExactQuickPhoneMatch(u.phone ?? "", fullPhone, nationalDigits),
                                    );

                                    return (
                                        <>
                                            {showOrdersContext && !exactHitInList ? (
                                                <QuickPhoneCustomerOption
                                                    title={quickPhoneSuggestedName || "Гость"}
                                                    phoneLine={`+${fullPhone} — создать заказ`}
                                                    badge={
                                                        quickPhoneContext?.matched_user
                                                            ? "В базе"
                                                            : "Гость"
                                                    }
                                                    context={quickPhoneContext}
                                                    showFullOrders={showOrdersContext}
                                                    onClick={() =>
                                                        openCreateOrderWithPhone(
                                                            nationalDigits,
                                                            quickPhoneSuggestedName,
                                                        )
                                                    }
                                                />
                                            ) : null}
                                            {quickPhoneHits.length === 0 ? (
                                                showOrdersContext || quickPhoneContext?.matched_user ? (
                                                    <QuickPhoneCustomerOption
                                                        title={
                                                            quickPhoneSuggestedName || `+${fullPhone}`
                                                        }
                                                        phoneLine={`+${fullPhone} — создать заказ`}
                                                        badge={
                                                            quickPhoneContext?.matched_user
                                                                ? "В базе"
                                                                : quickPhoneOrdersCount > 0
                                                                  ? "Гость"
                                                                  : null
                                                        }
                                                        context={quickPhoneContext}
                                                        showFullOrders={showOrdersContext}
                                                        onClick={() =>
                                                            openCreateOrderWithPhone(
                                                                nationalDigits,
                                                                quickPhoneSuggestedName,
                                                            )
                                                        }
                                                    />
                                                ) : nationalDigits.length >= 5 && nationalDigits.length < 9 ? (
                                                    <div className="px-3 py-2 text-xs text-admin-text-secondary">
                                                        Клиенты не найдены. Введите все 9 цифр — покажем
                                                        заказы гостя.
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="w-full px-3 py-2 text-left text-xs text-admin-text-secondary hover:bg-admin-muted"
                                                        onClick={() =>
                                                            openCreateOrderWithPhone(nationalDigits)
                                                        }
                                                    >
                                                        Клиенты не найдены — создать заказ с этим
                                                        номером
                                                    </button>
                                                )
                                            ) : (
                                                quickPhoneHits.map((u) => {
                                                    const hitName =
                                                        u.name?.trim() ||
                                                        quickPhoneSuggestedName ||
                                                        "";
                                                    const exact = isExactQuickPhoneMatch(
                                                        u.phone ?? "",
                                                        fullPhone,
                                                        nationalDigits,
                                                    );
                                                    return (
                                                        <QuickPhoneCustomerOption
                                                            key={u.id}
                                                            title={hitName || u.phone || `+${fullPhone}`}
                                                            phoneLine={u.phone || `+${fullPhone}`}
                                                            badge={
                                                                exact && quickPhoneContext?.matched_user
                                                                    ? "В базе"
                                                                    : exact && showOrdersContext
                                                                      ? "Гость"
                                                                      : null
                                                            }
                                                            context={quickPhoneContext}
                                                            showFullOrders={Boolean(
                                                                showOrdersContext && exact,
                                                            )}
                                                            userHit={u}
                                                            onClick={() =>
                                                                openCreateOrderWithPhone(
                                                                    u.phone ?? nationalDigits,
                                                                    hitName,
                                                                )
                                                            }
                                                        />
                                                    );
                                                })
                                            )}
                                        </>
                                    );
                                })()}
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
                        className="inline-flex rounded-lg border border-admin-border bg-admin-surface p-2 text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text lg:hidden"
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
