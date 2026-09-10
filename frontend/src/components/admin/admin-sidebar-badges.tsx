"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { fetchOrdersStats } from "@/lib/admin-orders-api";
import { fetchAdminReviewsStats } from "@/lib/admin-reviews-api";
import { fetchProductSeoQueueBadge } from "@/lib/admin-seo-product-descriptions-api";
import {
    fetchLastPriceRefreshAt,
    formatPriceRefreshDayMonth,
} from "@/lib/admin-pricing-api";
import {
    fetchLastAllparfumeCrawledAt,
    formatAllparfumeUpdatedAt,
} from "@/lib/admin-allparfume-api";
import { fetchAdminStockNotificationStats } from "@/lib/stock-notifications-api";
import { useSmartPolling } from "@/hooks/use-smart-polling";

export type BadgeKey = "ordersNew" | "stockProductRequestsNew" | "reviewsPending" | "seoQueued";
export type AlertBadgeKey = "ordersOverdue";
export type MetaBadgeKey = "priceRefreshLast" | "allparfumeLast";

export type AdminSidebarBadges = {
    badgeCounts: Record<BadgeKey, number>;
    alertBadgeCounts: Record<AlertBadgeKey, number>;
    metaBadgeValues: Record<MetaBadgeKey, string | null>;
};

const STORAGE_KEY = "admin-sidebar-badges-v1";
const ORDERS_STATS_ACTIVE_MS = 15_000;
const ORDERS_STATS_IDLE_MS = 60_000;

const EMPTY_BADGES: AdminSidebarBadges = {
    badgeCounts: {
        ordersNew: 0,
        stockProductRequestsNew: 0,
        reviewsPending: 0,
        seoQueued: 0,
    },
    alertBadgeCounts: {
        ordersOverdue: 0,
    },
    metaBadgeValues: {
        priceRefreshLast: null,
        allparfumeLast: null,
    },
};

function readStoredBadges(): AdminSidebarBadges {
    if (typeof window === "undefined") {
        return EMPTY_BADGES;
    }
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return EMPTY_BADGES;
        }
        const parsed = JSON.parse(raw) as AdminSidebarBadges;
        return {
            badgeCounts: { ...EMPTY_BADGES.badgeCounts, ...parsed.badgeCounts },
            alertBadgeCounts: { ...EMPTY_BADGES.alertBadgeCounts, ...parsed.alertBadgeCounts },
            metaBadgeValues: { ...EMPTY_BADGES.metaBadgeValues, ...parsed.metaBadgeValues },
        };
    } catch {
        return EMPTY_BADGES;
    }
}

function writeStoredBadges(value: AdminSidebarBadges): void {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
        /* quota / private mode */
    }
}

const SidebarBadgesContext = createContext<AdminSidebarBadges>(EMPTY_BADGES);

export function AdminSidebarBadgesProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [badges, setBadges] = useState<AdminSidebarBadges>(EMPTY_BADGES);
    const [cacheReady, setCacheReady] = useState(false);
    const badgesRef = useRef(EMPTY_BADGES);

    useEffect(() => {
        const stored = readStoredBadges();
        badgesRef.current = stored;
        setBadges(stored);
        setCacheReady(true);
    }, []);

    const loadSidebarBadgeStats = useCallback(async (signal: AbortSignal): Promise<{ active: boolean }> => {
        const [ordersResult, stockResult, reviewsResult, seoResult, priceRefreshResult, allparfumeResult] =
            await Promise.allSettled([
                fetchOrdersStats(signal),
                fetchAdminStockNotificationStats(signal),
                fetchAdminReviewsStats(signal),
                fetchProductSeoQueueBadge(signal),
                fetchLastPriceRefreshAt(signal),
                fetchLastAllparfumeCrawledAt(signal),
            ]);

        const next: AdminSidebarBadges = {
            badgeCounts: { ...badgesRef.current.badgeCounts },
            alertBadgeCounts: { ...badgesRef.current.alertBadgeCounts },
            metaBadgeValues: { ...badgesRef.current.metaBadgeValues },
        };

        if (ordersResult.status === "fulfilled") {
            next.badgeCounts.ordersNew = ordersResult.value.data.by_status.new ?? 0;
            next.alertBadgeCounts.ordersOverdue = ordersResult.value.data.overdue_delivery ?? 0;
        }

        if (stockResult.status === "fulfilled") {
            const backInStock = stockResult.value.data.back_in_stock_new ?? 0;
            const callback = stockResult.value.data.callback_new ?? 0;
            next.badgeCounts.stockProductRequestsNew = backInStock + callback;
        }

        if (reviewsResult.status === "fulfilled") {
            next.badgeCounts.reviewsPending = reviewsResult.value.data.pending_count ?? 0;
        }

        if (seoResult.status === "fulfilled") {
            next.badgeCounts.seoQueued = seoResult.value.data.queued ?? 0;
        }

        if (priceRefreshResult.status === "fulfilled") {
            next.metaBadgeValues.priceRefreshLast = formatPriceRefreshDayMonth(priceRefreshResult.value);
        }

        if (allparfumeResult.status === "fulfilled") {
            next.metaBadgeValues.allparfumeLast = formatAllparfumeUpdatedAt(allparfumeResult.value);
        }

        badgesRef.current = next;
        setBadges(next);
        writeStoredBadges(next);

        return {
            active:
                next.badgeCounts.ordersNew > 0 ||
                next.alertBadgeCounts.ordersOverdue > 0 ||
                next.badgeCounts.stockProductRequestsNew > 0 ||
                next.badgeCounts.reviewsPending > 0 ||
                next.badgeCounts.seoQueued > 0,
        };
    }, []);

    const { refresh } = useSmartPolling({
        activeIntervalMs: ORDERS_STATS_ACTIVE_MS,
        idleIntervalMs: ORDERS_STATS_IDLE_MS,
        fetcherAction: loadSidebarBadgeStats,
        enabled: cacheReady,
    });

    const prevPathRef = useRef<string | null>(null);
    useEffect(() => {
        if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
            refresh();
        }
        prevPathRef.current = pathname;
    }, [pathname, refresh]);

    return <SidebarBadgesContext.Provider value={badges}>{children}</SidebarBadgesContext.Provider>;
}

export function useAdminSidebarBadges(): AdminSidebarBadges {
    return useContext(SidebarBadgesContext);
}
