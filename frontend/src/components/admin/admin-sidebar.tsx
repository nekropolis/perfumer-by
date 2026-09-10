"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import {
    AlertTriangle,
    BarChart3,
    BellRing,
    Boxes,
    CreditCard,
    FileBarChart,
    FileText,
    FolderSync,
    Inbox,
    LayoutDashboard,
    Link2,
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
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
    type AlertBadgeKey,
    type BadgeKey,
    type MetaBadgeKey,
    useAdminSidebarBadges,
} from "@/components/admin/admin-sidebar-badges";

type LinkItem = {
    type: "link";
    href: string;
    label: string;
    icon: LucideIcon;
    badgeKey?: BadgeKey;
    badgeLabel?: string;
    alertBadgeKey?: AlertBadgeKey;
    metaBadgeKey?: MetaBadgeKey;
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
            {
                type: "link",
                href: "/admin/pricing/refresh",
                label: "Обновление цен",
                icon: RefreshCw,
                metaBadgeKey: "priceRefreshLast",
            },
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
            { type: "link", href: "/admin/products/variants", label: "Варианты", icon: Boxes },
            { type: "link", href: "/admin/attributes", label: "Атрибуты", icon: ListFilter },
        ],
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
            {
                type: "link",
                href: "/admin/import-export/allparfume",
                label: "Allparfume",
                icon: FolderSync,
                metaBadgeKey: "allparfumeLast",
            },
            { type: "link", href: "/admin/import-export/seller-pars", label: "Парсинг поставщиков", icon: FolderSync },
        ],
    },
    {
        key: "seo",
        label: "SEO",
        items: [
            {
                type: "link",
                href: "/admin/seo/product-descriptions",
                label: "Описание продуктов",
                icon: FileText,
                badgeKey: "seoQueued",
                badgeLabel: "В очереди",
            },
            {
                type: "link",
                href: "/admin/seo-redirects",
                label: "Редиректы",
                icon: Link2,
            },
            {
                type: "link",
                href: "/admin/legacy-products",
                label: "Legacy products",
                icon: Link2,
            },
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
    fitContent?: boolean;
};

type TooltipState = {
    label: string;
    x: number;
    y: number;
} | null;

function formatBadgeCount(count: number): string {
    if (count > 99) return "99+";
    return String(count);
}

function SidebarBadge({
    count,
    compact,
    label = "Новых",
}: {
    count: number;
    compact: boolean;
    label?: string;
}) {
    if (count <= 0) return null;

    if (compact) {
        return (
            <span
                className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm ring-2 ring-admin-sidebar"
                aria-label={`${label}: ${count}`}
            >
                {formatBadgeCount(count)}
            </span>
        );
    }

    return (
        <span
            className="ml-2 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(244,63,94,0.45)]"
            aria-label={`${label}: ${count}`}
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

function SidebarMetaBadge({
    value,
    compact,
    label,
}: {
    value: string | null;
    compact: boolean;
    label: string;
}) {
    if (!value) return null;

    if (compact) {
        return (
            <span
                className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-slate-600 px-1 py-0.5 text-[9px] font-semibold leading-none tabular-nums text-white shadow-sm ring-2 ring-admin-sidebar"
                aria-label={`${label}: ${value}`}
                title={`${label}: ${value}`}
            >
                {value}
            </span>
        );
    }

    return (
        <span
            className="ml-2 inline-flex h-5 shrink-0 items-center rounded-full bg-slate-200/90 px-1.5 text-[10px] font-semibold leading-none tabular-nums text-slate-700"
            aria-label={`${label}: ${value}`}
            title={`${label}: ${value}`}
        >
            {value}
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

    if (targetPath === "/admin/products" && pathname.startsWith("/admin/products/variants")) {
        return false;
    }

    // Раздел «Обновление цен»: все вложенные страницы (/history, /formulas, …)
    // оставляют активным главный пункт сайдбара.
    if (targetPath === "/admin/pricing/refresh" && pathname.startsWith("/admin/pricing")) {
        return true;
    }

    return targetPath !== "/admin" && pathname.startsWith(targetPath) && currentQuery === "";
}

export default function AdminSidebar({ onNavigateAction, collapsed = false, fitContent = false }: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentQuery = searchParams.toString();
    const [tooltip, setTooltip] = useState<TooltipState>(null);
    const { badgeCounts, alertBadgeCounts, metaBadgeValues } = useAdminSidebarBadges();
    const metaBadgeLabels: Record<MetaBadgeKey, string> = {
        priceRefreshLast: "Последнее обновление цен",
        allparfumeLast: "Последнее обновление Allparfume",
    };

    return (
        <aside className={`${fitContent ? "w-max" : "w-full"} overflow-visible`}>
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
                                    const metaBadge = item.metaBadgeKey
                                        ? metaBadgeValues[item.metaBadgeKey]
                                        : null;
                                    const metaBadgeLabel = item.metaBadgeKey
                                        ? metaBadgeLabels[item.metaBadgeKey]
                                        : "";

                                    const badges = (
                                        <>
                                            <SidebarBadge
                                                count={badgeCount}
                                                compact={false}
                                                label={item.badgeLabel}
                                            />
                                            <SidebarAlertBadge count={alertCount} compact={false} />
                                            <SidebarMetaBadge
                                                value={metaBadge}
                                                compact={false}
                                                label={metaBadgeLabel}
                                            />
                                        </>
                                    );

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
                                            className={`group relative flex items-center gap-2 rounded-lg border-l-2 py-1.5 text-[13px] transition-colors ${isActive
                                                    ? "border-admin-primary bg-white pl-[calc(1rem-2px)] font-semibold text-admin-primary shadow-sm"
                                                    : "border-transparent pl-4 font-medium text-admin-text hover:bg-white/70 hover:text-admin-text"
                                                } ${collapsed ? "justify-center border-l-0 px-2 pl-2" : ""} ${fitContent ? "w-full whitespace-nowrap pr-10" : "pr-2.5"}`}
                                        >
                                            <span
                                                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${isActive
                                                        ? "bg-admin-primary/10 text-admin-primary"
                                                        : "text-admin-text-secondary group-hover:bg-white group-hover:text-admin-text"
                                                    }`}
                                            >
                                                <Icon size={17} />
                                                {collapsed ? (
                                                    <>
                                                        <SidebarBadge
                                                            count={badgeCount}
                                                            compact
                                                            label={item.badgeLabel}
                                                        />
                                                        <SidebarAlertBadge count={alertCount} compact />
                                                        <SidebarMetaBadge
                                                            value={metaBadge}
                                                            compact
                                                            label={metaBadgeLabel}
                                                        />
                                                    </>
                                                ) : null}
                                            </span>

                                            {!collapsed ? (
                                                <div className={`flex items-center ${fitContent ? "" : "min-w-0 flex-1"}`}>
                                                    <div className={fitContent ? "leading-5" : "truncate leading-5"}>
                                                        {item.label}
                                                    </div>
                                                    {fitContent ? (
                                                        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
                                                            {badges}
                                                        </span>
                                                    ) : (
                                                        badges
                                                    )}
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
