import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export type AdminUser = {
    id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    role: string;
    phone_verified_at?: string | null;
    orders_count?: number;
    discount_cards?: {
        id: number;
        number: string;
        discount_percent: number;
        status: string;
    }[];
};

export type AdminUsersResponse = {
    data: AdminUser[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

export type AdminUserResponse = {
    data: AdminUser;
};

export type AdminUserOrderHistoryItem = {
    id: number;
    created_at: string;
    items_qty: number;
    total: string;
    status: string;
};

export async function fetchAdminUsers(
    params: { search?: string; page?: number } = {}
): Promise<AdminUsersResponse> {
    const search = (params.search ?? "").trim();
    const page = Number(params.page ?? 1);
    const queryParams = new URLSearchParams();
    if (search !== "") {
        queryParams.set("search", search);
    }
    if (Number.isFinite(page) && page > 1) {
        queryParams.set("page", String(Math.floor(page)));
    }
    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";

    const res = await fetch(`${API_BASE}/admin/users${query}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Users API error: ${res.status}`);
    }

    return res.json();
}

export async function updateAdminUserRole(id: number, role: string) {
    const res = await fetch(`${API_BASE}/admin/users/${id}/role`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify({ role }),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Update role API error: ${res.status}`);
    }

    return res.json();
}

export async function updateAdminUser(
    id: number,
    payload: {
        name: string;
        email: string | null;
        phone: string | null;
        role: string;
        password?: string | null;
        password_confirmation?: string | null;
    }
) {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || `Update user API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminUser(id: number): Promise<AdminUserResponse> {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`User API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminUserOrdersHistory(id: number): Promise<{ data: AdminUserOrderHistoryItem[] }> {
    const res = await fetch(`${API_BASE}/admin/users/${id}/orders-history`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`User orders history API error: ${res.status}`);
    }

    return res.json();
}

export async function createAdminUser(payload: {
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    password?: string | null;
}) {
    const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Create user API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteAdminUser(id: number) {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Delete user API error: ${res.status}`);
    }

    return res.json();
}