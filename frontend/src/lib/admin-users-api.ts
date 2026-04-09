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

export async function fetchAdminUsers(search = ""): Promise<AdminUsersResponse> {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";

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