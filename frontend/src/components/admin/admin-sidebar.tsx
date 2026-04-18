"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import {
    BarChart3,
    BellRing,
    Boxes,
    FileBarChart,
    FolderSync,
    Inbox,
    LayoutDashboard,
    ListFilter,
    Package,
    PackageMinus,
    PhoneCall,
    ScrollText,
    ShieldUser,
    ShoppingCart,
    Tags,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { fetchOrdersStats } from "@/lib/admin-orders-api";
import { useSmartPolling } from "@/hooks/use-smart-polling";

type BadgeKey = "ordersNew";

type LinkItem = {
    type: "link";
    href: string;
    label: string;
    icon: LucideIcon;
    badgeKey?: BadgeKey;
};
type SidebarItem = LinkItem;

type SidebarSection = {
    key: string;
    label: string;
    items: SidebarItem[];
};

const sections: SidebarSection[] = [
    {
        key: "main",
        label: "Основное",
        items: [
            { type: "link", href: "/admin", label: "Дашборд", icon: LayoutDashboard },
            { type: "link", href: "/admin/orders", label: "Заказы", icon: ShoppingCart, badgeKey: "ordersNew" },
            { type: "link", href: "/admin/stock-notifications?kind=back_in_stock", label: "Запросы на поступление", icon: BellRing },
            { type: "link", href: "/admin/stock-notifications?kind=callback", label: "Заказы звонков", icon: PhoneCall },
        ],
    },
    {
        key: "catalog",
        label: "Каталог",
        items: [
            { type: "link", href: "/admin/brands", label: "Бренды", icon: Tags },
            { type: "link", href: "/admin/products", label: "Продукты", icon: Package },
            { type: "link", href: "/admin/products/variants", label: "Варианты продукта", icon: Boxes },
            { type: "link", href: "/admin/attributes", label: "Атрибуты", icon: ListFilter },
        ],
    },
    {
        key: "warehouse",
        label: "Склад",
        items: [
            { type: "link", href: "/admin/warehouse/receipts", label: "Приходы", icon: Inbox },
            { type: "link", href: "/admin/warehouse/writeoffs", label: "Списания", icon: PackageMinus },
            { type: "link", href: "/admin/warehouse/balances", label: "Остатки", icon: BarChart3 },
            { type: "link", href: "/admin/warehouse/reports", label: "Отчеты", icon: FileBarChart },
        ],
    },
    {
        key: "imports",
        label: "Импорт и парсинг",
        items: [
            { type: "link", href: "/admin/import-export/vanille-parsing", label: "Vanilla", icon: FolderSync },
            { type: "link", href: "/admin/import-export/seller-one", label: "Seller One", icon: FolderSync },
        ],
    },
    {
        key: "system",
        label: "Система",
        items: [
            { type: "link", href: "/admin/users", label: "Пользователи", icon: ShieldUser },
            { type: "link", href: "/admin/system/audit-log", label: "Аудит", icon: ScrollText },
            { type: "link", href: "/admin/system/stock-receipts-import", label: "Импорт приходов XLS", icon: FolderSync },
        ],
    },
];

type Props = {
    onNavigateAction?: () => void;
    collapsed?: boolean;
};

type TooltipState = {
    label: string;
    x: number;
    y: number;
} | null;

// Когда новых заказов > 0 — хотим обновлять чаще (клиент ждёт обработки),
// в «тишине» (0 новых) — редко, чтобы не шуметь в сети.
const ORDERS_STATS_ACTIVE_MS = 15_000;
const ORDERS_STATS_IDLE_MS = 60_000;

function formatBadgeCount(count: number): string {
    if (count > 99) return "99+";
    return String(count);
}

function SidebarBadge({
    count,
    compact,
}: {
    count: number;
    compact: boolean;
}) {
    if (count <= 0) return null;

    if (compact) {
        return (
            <span
                className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(244,63,94,0.45)] ring-2 ring-white"
                aria-label={`Новых: ${count}`}
            >
                {formatBadgeCount(count)}
            </span>
        );
    }

    return (
        <span
            className="ml-2 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(244,63,94,0.45)]"
            aria-label={`Новых: ${count}`}
        >
            {formatBadgeCount(count)}
        </span>
    );
}

function FloatingTooltip({ tooltip }: { tooltip: TooltipState }) {
    if (!tooltip || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <span
            className="pointer-events-none fixed z-[9999] -translate-y-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg"
            style={{ left: tooltip.x, top: tooltip.y }}
        >
            {tooltip.label}
        </span>,
        document.body
    );
}

function isItemActive(
    pathname: string,
    currentQuery: string,
    href: string,
): boolean {
    const [targetPath, targetQuery = ""] = href.split("?");

    // Пункты с query (например, фильтром по kind) подсвечиваются только
    // при точном совпадении всех ключевых параметров.
    if (targetQuery) {
        if (pathname !== targetPath) return false;
        const currentParams = new URLSearchParams(currentQuery);
        const targetParams = new URLSearchParams(targetQuery);
        for (const [key, value] of targetParams.entries()) {
            if (currentParams.get(key) !== value) return false;
        }
        return true;
    }

    if (pathname === targetPath) {
        return true;
    }

    // Пропускаем общий пункт секции, если активен пункт с фильтром:
    // корневой /admin/stock-notifications не должен светиться,
    // когда подсвечен более специфичный ?kind=...
    return targetPath !== "/admin" && pathname.startsWith(targetPath) && currentQuery === "";
}

function sectionHasActiveItem(
    section: SidebarSection,
    pathname: string,
    currentQuery: string,
): boolean {
    return section.items.some((item) => isItemActive(pathname, currentQuery, item.href));
}

export default function AdminSidebar({ onNavigateAction, collapsed = false }: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentQuery = searchParams.toString();
    const [tooltip, setTooltip] = useState<TooltipState>(null);
    const [newOrdersCount, setNewOrdersCount] = useState(0);

    const flatItems = useMemo(() => sections.flatMap((section) => section.items), []);
    const _hasItems = flatItems.length > 0;
    void _hasItems;

    const loadOrdersStats = useCallback(
        async (signal: AbortSignal): Promise<{ active: boolean }> => {
            try {
                const response = await fetchOrdersStats(signal);
                const count = response.data.by_status.new ?? 0;
                setNewOrdersCount(count);
                return { active: count > 0 };
            } catch {
                // Сетевые ошибки глушим — бейдж просто не обновится, поллер поедет дальше.
                return { active: false };
            }
        },
        [],
    );

    const { refresh: refreshOrdersStats } = useSmartPolling({
        activeIntervalMs: ORDERS_STATS_ACTIVE_MS,
        idleIntervalMs: ORDERS_STATS_IDLE_MS,
        fetcher: loadOrdersStats,
    });

    // Переход между страницами админки — хороший повод освежить счётчик
    // (например, после того, как администратор открыл /admin/orders и обработал заказ).
    // На первом рендере ничего не делаем: useSmartPolling сам уже запросил данные.
    const prevPathRef = useRef<string | null>(null);
    useEffect(() => {
        if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
            refreshOrdersStats();
        }
        prevPathRef.current = pathname;
    }, [pathname, refreshOrdersStats]);

    const badgeCounts: Record<BadgeKey, number> = {
        ordersNew: newOrdersCount,
    };

    return (
        <aside className="w-full overflow-visible rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <nav className="space-y-2.5 overflow-visible">
                {sections
                    .filter((section) => section.items.length > 0)
                    .map((section) => (
                        <div key={section.key} className="mt-2 space-y-2 overflow-visible">
                            {!collapsed ? (
                                <div className="flex items-center gap-2 px-2 pt-0.5">
                                    <span className="h-px flex-1 bg-slate-200/90" />
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        {section.label}
                                    </div>
                                    <span className="h-px flex-1 bg-slate-200/90" />
                                </div>
                            ) : (
                                <div className="mx-auto h-px w-8 bg-slate-200" />
                            )}

                            <div
                                className={`space-y-1 rounded-[20px] p-1.5 ring-1 transition-colors ${
                                    sectionHasActiveItem(section, pathname, currentQuery)
                                        ? "bg-white ring-slate-200 shadow-[0_6px_18px_rgba(15,23,42,0.06)]"
                                        : "bg-white/70 ring-slate-200/70"
                                }`}
                            >
                                {section.items.map((item) => {
                                    const isActive = isItemActive(pathname, currentQuery, item.href);
                                    const Icon = item.icon;
                                    const badgeCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;

                                    return (
                                        <Link
                                            key={`${section.key}-${item.label}-${item.href}`}
                                            href={item.href}
                                            onClick={onNavigateAction}
                                            onMouseEnter={(event) => {
                                                if (!collapsed) {
                                                    return;
                                                }

                                                const rect = event.currentTarget.getBoundingClientRect();
                                                setTooltip({
                                                    label: item.label,
                                                    x: rect.right + 12,
                                                    y: rect.top + rect.height / 2,
                                                });
                                            }}
                                            onMouseLeave={() => setTooltip(null)}
                                            onFocus={(event) => {
                                                if (!collapsed) {
                                                    return;
                                                }

                                                const rect = event.currentTarget.getBoundingClientRect();
                                                setTooltip({
                                                    label: item.label,
                                                    x: rect.right + 12,
                                                    y: rect.top + rect.height / 2,
                                                });
                                            }}
                                            onBlur={() => setTooltip(null)}
                                            className={`group relative flex items-center gap-2.5 rounded-[18px] px-2.5 py-2 text-[13px] transition-all duration-200 ${
                                                isActive
                                                    ? "bg-slate-900 text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
                                                    : "text-slate-700 hover:bg-slate-100/90 hover:text-slate-950"
                                            } ${collapsed ? "justify-center px-2" : ""}`}
                                        >
                                            <span
                                                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 ${
                                                    isActive
                                                        ? "border-white/10 bg-white/10 text-white"
                                                        : "border-slate-200 bg-slate-50 text-slate-500 group-hover:border-slate-300 group-hover:bg-white group-hover:text-slate-900"
                                                }`}
                                            >
                                                <Icon size={16} className="transition-transform duration-200 group-hover:scale-105" />
                                                {collapsed ? (
                                                    <SidebarBadge count={badgeCount} compact />
                                                ) : null}
                                            </span>

                                            {!collapsed ? (
                                                <div className="flex min-w-0 flex-1 items-center">
                                                    <div className={`truncate leading-5 ${isActive ? "font-semibold" : "font-medium"}`}>
                                                        {item.label}
                                                    </div>
                                                    <SidebarBadge count={badgeCount} compact={false} />
                                                </div>
                                            ) : null}

                                            {!collapsed && isActive && badgeCount === 0 ? (
                                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                                            ) : null}

                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
            </nav>
            <FloatingTooltip tooltip={tooltip} />
        </aside>
    );
}
