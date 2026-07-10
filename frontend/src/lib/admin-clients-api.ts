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

export type AdminClient = {
    id: number;
    name: string | null;
    first_name?: string | null;
    last_name?: string | null;
    patronymic?: string | null;
    birth_date?: string | null;
    email: string | null;
    phone: string | null;
    phone_verified_at?: string | null;
    orders_count?: number;
    discount_cards?: {
        id: number;
        number: string;
        discount_percent: number;
        status: string;
    }[];
};

type AdminClientPayload = {
    first_name?: string | null;
    last_name?: string | null;
    patronymic?: string | null;
    birth_date?: string | null;
    email: string | null;
    phone: string;
    password?: string | null;
    password_confirmation?: string | null;
};

export type AdminClientsResponse = {
    data: AdminClient[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

export type AdminClientResponse = {
    data: AdminClient;
};

export type AdminClientOrderHistoryItem = {
    id: number;
    created_at: string;
    items_qty: number;
    total: string;
    status: string;
};

export function formatAdminClientPrimary(client: Pick<AdminClient, "name" | "phone" | "email">): string {
    const name = client.name?.trim();
    if (name) return name;
    if (client.phone?.trim()) return client.phone.trim();
    return client.email?.trim() || "Клиент";
}

export async function fetchAdminClients(
    params: { search?: string; page?: number } = {}
): Promise<AdminClientsResponse> {
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

    const res = await fetch(`${API_BASE}/admin/clients${query}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Clients API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminClient(id: number): Promise<AdminClientResponse> {
    const res = await fetch(`${API_BASE}/admin/clients/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Client API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAdminClientOrdersHistory(id: number): Promise<{ data: AdminClientOrderHistoryItem[] }> {
    const res = await fetch(`${API_BASE}/admin/clients/${id}/orders-history`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Client orders history API error: ${res.status}`);
    }

    return res.json();
}

export async function createAdminClient(payload: AdminClientPayload) {
    const res = await fetch(`${API_BASE}/admin/clients`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Create client API error: ${res.status}`);
    }

    return res.json();
}

export async function updateAdminClient(id: number, payload: AdminClientPayload) {
    const res = await fetch(`${API_BASE}/admin/clients/${id}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || `Update client API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteAdminClient(id: number) {
    const res = await fetch(`${API_BASE}/admin/clients/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Delete client API error: ${res.status}`);
    }

    return res.json();
}
