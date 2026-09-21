import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export type AdminDashboardStatsResponse = {
    data: {
        active: {
            orders: number;
            orders_by_status: Record<string, number>;
            back_in_stock_requests: number;
            back_in_stock_by_status: Record<string, number>;
            callback_requests: number;
            callback_by_status: Record<string, number>;
        };
        stock: {
            products_in_stock: number;
            variants_in_stock: number;
        };
        month: {
            period: "month" | "quarter" | "year";
            ordered_products_qty: number;
            cancelled_products_qty: number;
            sold_products_qty: number;
            timeline: {
                labels: string[];
                ordered: number[];
                cancelled: number[];
                sold: number[];
            };
        };
    };
};

export async function fetchAdminDashboardStats(
    params?: { period?: "month" | "quarter" | "year"; signal?: AbortSignal }
): Promise<AdminDashboardStatsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.period) {
        searchParams.set("period", params.period);
    }

    const res = await fetch(`${API_BASE}/admin/dashboard/stats${searchParams.toString() ? `?${searchParams.toString()}` : ""}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
        signal: params?.signal,
    });

    if (!res.ok) {
        throw new Error(`Dashboard stats API error: ${res.status}`);
    }

    return res.json();
}

export type AdminDashboardViewedPeriod = "day" | "week" | "month" | "quarter" | "year";

export type AdminDashboardViewedProduct = {
    id: number;
    name: string;
    slug: string | null;
    views_count: number;
};

export type AdminDashboardViewedProductsResponse = {
    data: {
        period: AdminDashboardViewedPeriod;
        retention_days: number;
        items: AdminDashboardViewedProduct[];
    };
};

export async function fetchAdminDashboardViewedProducts(
    params?: { period?: AdminDashboardViewedPeriod; signal?: AbortSignal }
): Promise<AdminDashboardViewedProductsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.period) {
        searchParams.set("period", params.period);
    }

    const res = await fetch(
        `${API_BASE}/admin/dashboard/viewed-products${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
            signal: params?.signal,
        },
    );

    if (!res.ok) {
        throw new Error(`Dashboard viewed products API error: ${res.status}`);
    }

    return res.json();
}

export type AdminDashboardWishlistProduct = {
    id: number;
    name: string;
    slug: string | null;
    wishlists_count: number;
};

export type AdminDashboardWishlistProductsResponse = {
    data: {
        period: AdminDashboardViewedPeriod;
        items: AdminDashboardWishlistProduct[];
    };
};

export async function fetchAdminDashboardWishlistProducts(
    params?: { period?: AdminDashboardViewedPeriod; signal?: AbortSignal }
): Promise<AdminDashboardWishlistProductsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.period) {
        searchParams.set("period", params.period);
    }

    const res = await fetch(
        `${API_BASE}/admin/dashboard/wishlisted-products${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
            signal: params?.signal,
        },
    );

    if (!res.ok) {
        throw new Error(`Dashboard wishlisted products API error: ${res.status}`);
    }

    return res.json();
}

export type AdminDashboardSalesPeriod = "month" | "quarter" | "year" | "custom";

export type AdminDashboardTopSoldVariant = {
    id: number;
    title: string;
    qty: number;
};

export type AdminDashboardTopSoldProduct = {
    id: number;
    name: string;
    slug: string | null;
    qty: number;
    variants: AdminDashboardTopSoldVariant[];
};

export type AdminDashboardTopSoldProductsResponse = {
    data: {
        period: AdminDashboardSalesPeriod;
        date_from: string;
        date_to: string;
        items: AdminDashboardTopSoldProduct[];
    };
};

export type AdminDashboardNetProfitResponse = {
    data: {
        period: AdminDashboardSalesPeriod;
        date_from: string;
        date_to: string;
        revenue: string;
        cost: string;
        product_profit: string;
        delivery_expense: string;
        net_profit: string;
    };
};

function dashboardSalesSearchParams(params?: {
    period?: AdminDashboardSalesPeriod;
    dateFrom?: string;
    dateTo?: string;
}): URLSearchParams {
    const searchParams = new URLSearchParams();
    if (params?.period) {
        searchParams.set("period", params.period);
    }
    if (params?.period === "custom") {
        if (params.dateFrom) {
            searchParams.set("date_from", params.dateFrom);
        }
        if (params.dateTo) {
            searchParams.set("date_to", params.dateTo);
        }
    }

    return searchParams;
}

export async function fetchAdminDashboardTopSoldProducts(params?: {
    period?: AdminDashboardSalesPeriod;
    dateFrom?: string;
    dateTo?: string;
    signal?: AbortSignal;
}): Promise<AdminDashboardTopSoldProductsResponse> {
    const searchParams = dashboardSalesSearchParams(params);

    const res = await fetch(
        `${API_BASE}/admin/dashboard/top-sold-products${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
            signal: params?.signal,
        },
    );

    if (!res.ok) {
        throw new Error(`Dashboard top sold products API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminDashboardNetProfit(params?: {
    period?: AdminDashboardSalesPeriod;
    dateFrom?: string;
    dateTo?: string;
    signal?: AbortSignal;
}): Promise<AdminDashboardNetProfitResponse> {
    const searchParams = dashboardSalesSearchParams(params);

    const res = await fetch(
        `${API_BASE}/admin/dashboard/net-profit${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
            signal: params?.signal,
        },
    );

    if (!res.ok) {
        throw new Error(`Dashboard net profit API error: ${res.status}`);
    }

    return res.json();
}
