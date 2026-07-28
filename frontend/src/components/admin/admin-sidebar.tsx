"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import {
    AlertTriangle,
    BarChart3,
    BellRing,
    CreditCard,
    FileBarChart,
    FolderSync,
    Inbox,
    LayoutDashboard,
    ListFilter,
    MapPin,
    MessageSquare,
    Package,
    PackageMinus,
    PanelsTopLeft,
    Phone,
    RefreshCw,
    ScrollText,
    Settings,
    ShieldUser,
    ShoppingCart,
    Users,
    Tags,
    Ticket,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { fetchOrdersStats } from "@/lib/admin-orders-api";
import { fetchAdminReviewsStats } from "@/lib/admin-reviews-api";
import { fetchAdminStockNotificationStats } from "@/lib/stock-notifications-api";
import { useSmartPolling } from "@/hooks/use-smart-polling";

type BadgeKey = "ordersNew" | "stockProductRequestsNew" | "reviewsPending";
type AlertBadgeKey = "ordersOverdue";

type LinkItem = {
    type: "link";
    href: string;
    label: string;
    icon: LucideIcon;
    badgeKey?: BadgeKey;
    alertBadgeKey?: AlertBadgeKey;
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
            { type: "link", href: "/admin/pricing/refresh", label: "Обновление цен", icon: RefreshCw },
            {
                type: "link",
                href: "/admin/orders",
                label: "Заказы",
                icon: ShoppingCart,
                badgeKey: "ordersNew",
                alertBadgeKey: "ordersOverdue",
            },
            {
                type: "link",
                href: "/admin/stock-notifications",
                label: "Запросы товаров",
                icon: BellRing,
                badgeKey: "stockProductRequestsNew",
            },
            { type: "link", href: "/admin/reviews", label: "Отзывы", icon: MessageSquare, badgeKey: "reviewsPending" },
            { type: "link", href: "/admin/pages", label: "Контент", icon: PanelsTopLeft },
            { type: "link", href: "/admin/shop-settings", label: "Настройки магазина", icon: Settings },
        ],
    },
    {
        key: "catalog",
        label: "Каталог",
        items: [
            { type: "link", href: "/admin/brands", label: "Бренды", icon: Tags },
            { type: "link", href: "/admin/products", label: "Продукты", icon: Package },
            { type: "link", href: "/admin/attributes", label: "Атрибуты", icon: ListFilter },        ],
    },
    {
        key: "loyalty",
        label: "Лояльность",
        items: [
            { type: "link", href: "/admin/loyalty/cards", label: "Накопительные карты", icon: CreditCard },
            { type: "link", href: "/admin/loyalty/certificates", label: "Сертификаты", icon: Ticket },
            { type: "link", href: "/admin/loyalty/reports", label: "Отчеты лояльности", icon: FileBarChart },
        ],
    },
    {
        key: "warehouse",
        label: "Склад",
        items: [
            { type: "link", href: "/admin/warehouse/receipts", label: "Приходы", icon: Inbox },
            { type: "link", href: "/admin/warehouse/writeoffs", label: "Списания/Резервы", icon: PackageMinus },
            { type: "link", href: "/admin/warehouse/balances", label: "Остатки", icon: BarChart3 },
            { type: "link", href: "/admin/warehouse/reports", label: "Отчеты", icon: FileBarChart },
        ],
    },
    {
        key: "imports",
        label: "Импорт и парсинг",
        items: [
            { type: "link", href: "/admin/import-export/vanille-parsing", label: "Vanilla", icon: FolderSync },
            { type: "link", href: "/admin/import-export/allparfume", label: "Allparfume", icon: FolderSync },
            { type: "link", href: "/admin/import-export/seller-one", label: "Seller One", icon: FolderSync },
        ],
    },
    {
        key: "system",
        label: "Система",
        items: [
            { type: "link", href: "/admin/clients", label: "Клиенты", icon: Users },
            { type: "link", href: "/admin/users", label: "Персонал", icon: ShieldUser },
            { type: "link", href: "/admin/system/incoming-call-devices", label: "Телефоны CRM", icon: Phone },
            { type: "link", href: "/admin/system/delivery-cities", label: "Города доставок", icon: MapPin },
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

// Когда есть новые заказы, отзывы на модерации или необработанные заявки (поступление / звонок) —
// поллим чаще; в «тишине» — реже.
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
                className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm ring-2 ring-admin-sidebar"
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

function SidebarAlertBadge({
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
                className="pointer-events-none absolute -bottom-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm ring-2 ring-admin-sidebar"
                aria-label={`Просрочено: ${count}`}
                title={`Просроченная доставка: ${count}`}
            >
                <AlertTriangle size={9} strokeWidth={2.75} aria-hidden />
            </span>
        );
    }

    return (
        <span
            className="ml-1.5 inline-flex h-5 items-center gap-1 rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(245,158,11,0.45)]"
            aria-label={`Просрочено: ${count}`}
            title={`Просроченная доставка: ${count}`}
        >
            <AlertTriangle size={11} strokeWidth={2.5} aria-hidden />
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
            className="pointer-events-none fixed z-[9999] -translate-y-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg"
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

    // Раздел «Обновление цен»: все вложенные страницы (/history, /formulas, …)
    // оставляют активным главный пункт сайдбара.
    if (targetPath === "/admin/pricing/refresh" && pathname.startsWith("/admin/pricing")) {
        return true;
    }

    return targetPath !== "/admin" && pathname.startsWith(targetPath) && currentQuery === "";
}

export default function AdminSidebar({ onNavigateAction, collapsed = false }: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentQuery = searchParams.toString();
    const [tooltip, setTooltip] = useState<TooltipState>(null);
    const [newOrdersCount, setNewOrdersCount] = useState(0);
    const [overdueOrdersCount, setOverdueOrdersCount] = useState(0);
    const [stockProductRequestsNew, setStockProductRequestsNew] = useState(0);
    const [reviewsPendingCount, setReviewsPendingCount] = useState(0);

    const flatItems = useMemo(() => sections.flatMap((section) => section.items), []);
    const _hasItems = flatItems.length > 0;
    void _hasItems;

    const loadSidebarBadgeStats = useCallback(
        async (signal: AbortSignal): Promise<{ active: boolean }> => {
            const [ordersResult, stockResult, reviewsResult] = await Promise.allSettled([
                fetchOrdersStats(signal),
                fetchAdminStockNotificationStats(signal),
                fetchAdminReviewsStats(signal),
            ]);

            let ordersNew = 0;
            let ordersOverdue = 0;
            if (ordersResult.status === "fulfilled") {
                ordersNew = ordersResult.value.data.by_status.new ?? 0;
                ordersOverdue = ordersResult.value.data.overdue_delivery ?? 0;
                setNewOrdersCount(ordersNew);
                setOverdueOrdersCount(ordersOverdue);
            }

            let backInStock = 0;
            let callback = 0;
            if (stockResult.status === "fulfilled") {
                backInStock = stockResult.value.data.back_in_stock_new ?? 0;
                callback = stockResult.value.data.callback_new ?? 0;
                setStockProductRequestsNew(backInStock + callback);
            }

            let reviewsPending = 0;
            if (reviewsResult.status === "fulfilled") {
                reviewsPending = reviewsResult.value.data.pending_count ?? 0;
                setReviewsPendingCount(reviewsPending);
            }

            const active =
                ordersNew > 0 ||
                ordersOverdue > 0 ||
                backInStock > 0 ||
                callback > 0 ||
                reviewsPending > 0;
            return { active };
        },
        [],
    );

    const { refresh: refreshSidebarBadgeStats } = useSmartPolling({
        activeIntervalMs: ORDERS_STATS_ACTIVE_MS,
        idleIntervalMs: ORDERS_STATS_IDLE_MS,
        fetcherAction: loadSidebarBadgeStats,
    });

    // Переход между страницами админки — освежить бейджи (заказы, заявки, отзывы).
    // На первом рендере ничего не делаем: useSmartPolling сам уже запросил данные.
    const prevPathRef = useRef<string | null>(null);
    useEffect(() => {
        if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
            refreshSidebarBadgeStats();
        }
        prevPathRef.current = pathname;
    }, [pathname, refreshSidebarBadgeStats]);

    const badgeCounts: Record<BadgeKey, number> = {
        ordersNew: newOrdersCount,
        stockProductRequestsNew: stockProductRequestsNew,
        reviewsPending: reviewsPendingCount,
    };
    const alertBadgeCounts: Record<AlertBadgeKey, number> = {
        ordersOverdue: overdueOrdersCount,
    };

    return (
        <aside className="w-full overflow-visible">
            <nav className="space-y-4 overflow-visible">
                {sections
                    .filter((section) => section.items.length > 0)
                    .map((section) => (
                        <div key={section.key} className="space-y-1 overflow-visible">
                            {!collapsed ? (
                                <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
                                    {section.label}
                                </div>
                            ) : (
                                <div className="mx-auto my-2 h-px w-6 bg-admin-border" />
                            )}

                            <div className="space-y-0.5">
                                {section.items.map((item) => {
                                    const isActive = isItemActive(pathname, currentQuery, item.href);
                                    const Icon = item.icon;
                                    const badgeCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
                                    const alertCount = item.alertBadgeKey
                                        ? alertBadgeCounts[item.alertBadgeKey]
                                        : 0;

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
                                            className={`group relative flex items-center gap-2 rounded-lg border-l-2 py-1.5 pr-2.5 text-[13px] transition-colors ${
                                                isActive
                                                    ? "border-admin-primary bg-white pl-[calc(1rem-2px)] font-semibold text-admin-primary shadow-sm"
                                                    : "border-transparent pl-4 font-medium text-admin-text hover:bg-white/70 hover:text-admin-text"
                                            } ${collapsed ? "justify-center border-l-0 px-2 pl-2" : ""}`}
                                        >
                                            <span
                                                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                                    isActive
                                                        ? "bg-admin-primary/10 text-admin-primary"
                                                        : "text-admin-text-secondary group-hover:bg-white group-hover:text-admin-text"
                                                }`}
                                            >
                                                <Icon size={17} />
                                                {collapsed ? (
                                                    <>
                                                        <SidebarBadge count={badgeCount} compact />
                                                        <SidebarAlertBadge count={alertCount} compact />
                                                    </>
                                                ) : null}
                                            </span>

                                            {!collapsed ? (
                                                <div className="flex min-w-0 flex-1 items-center">
                                                    <div className="truncate leading-5">
                                                        {item.label}
                                                    </div>
                                                    <SidebarBadge count={badgeCount} compact={false} />
                                                    <SidebarAlertBadge count={alertCount} compact={false} />
                                                </div>
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
