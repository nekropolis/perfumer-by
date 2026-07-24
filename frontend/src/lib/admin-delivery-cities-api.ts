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

export type DeliveryDays = {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
};

export type AdminDeliveryCityRow = {
    id: number;
    name: string;
    full_name: string;
    village_council_name: string | null;
    district_id: number | null;
    district_name: string | null;
    region_id: number | null;
    region_name: string | null;
    zone_name?: string | null;
    is_active: boolean;
    delivery_days: DeliveryDays;
    updated_at: string | null;
};

export type PaginatedDeliveryCities = {
    data: AdminDeliveryCityRow[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

export type VeterSyncResult = {
    tracks: number;
    districts: number;
    cities: number;
};

export async function fetchAdminDeliveryCities(params: {
    q?: string;
    page?: number;
    per_page?: number;
} = {}): Promise<PaginatedDeliveryCities> {
    const search = new URLSearchParams();
    if (params.q?.trim()) search.set("q", params.q.trim());
    if (params.page) search.set("page", String(params.page));
    if (params.per_page) search.set("per_page", String(params.per_page));

    const qs = search.toString();
    const res = await fetch(
        `${API_BASE}/admin/system/delivery-cities${qs ? `?${qs}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
        },
    );

    if (!res.ok) {
        throw new Error(`Ошибка загрузки городов: ${res.status}`);
    }

    return (await res.json()) as PaginatedDeliveryCities;
}

export async function syncAdminDeliveryCities(): Promise<{
    message: string;
    data: VeterSyncResult;
}> {
    const res = await fetch(`${API_BASE}/admin/system/delivery-cities/sync`, {
        method: "POST",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        data?: VeterSyncResult;
    };

    if (!res.ok) {
        throw new Error(body.message || `Ошибка синхронизации: ${res.status}`);
    }

    return {
        message: body.message || "Синхронизация завершена",
        data: body.data || { tracks: 0, districts: 0, cities: 0 },
    };
}
