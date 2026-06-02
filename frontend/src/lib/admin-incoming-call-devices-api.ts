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

export type IncomingCallDeviceManager = {
    id: number;
    name: string | null;
    phone: string | null;
    email: string | null;
    role: string;
};

export async function fetchIncomingCallDeviceManagers(): Promise<IncomingCallDeviceManager[]> {
    const res = await fetch(`${API_BASE}/admin/incoming-call-devices/managers`, {
        headers: getAdminHeaders(),
    });

    if (!res.ok) {
        throw new Error("Не удалось загрузить список менеджеров");
    }

    const json = (await res.json()) as { data: IncomingCallDeviceManager[] };
    return json.data;
}

export type IncomingCallDevice = {
    id: string;
    label: string;
    is_active: boolean;
    last_seen_at: string | null;
    manager: {
        id: number;
        name: string | null;
        phone: string | null;
        role: string;
    } | null;
};

export async function fetchIncomingCallDevices(): Promise<IncomingCallDevice[]> {
    const res = await fetch(`${API_BASE}/admin/incoming-call-devices`, {
        headers: getAdminHeaders(),
    });

    if (!res.ok) {
        throw new Error("Не удалось загрузить устройства");
    }

    const json = (await res.json()) as { data: IncomingCallDevice[] };
    return json.data;
}

export async function createIncomingCallDevice(payload: {
    label: string;
    manager_user_id: number;
}): Promise<{ device: IncomingCallDevice; token: string }> {
    const res = await fetch(`${API_BASE}/admin/incoming-call-devices`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? "Не удалось создать устройство");
    }

    const json = (await res.json()) as { data: IncomingCallDevice; token: string };
    return { device: json.data, token: json.token };
}

export async function regenerateIncomingCallDeviceToken(
    id: string,
): Promise<{ device: IncomingCallDevice; token: string }> {
    const res = await fetch(`${API_BASE}/admin/incoming-call-devices/${id}/regenerate-token`, {
        method: "POST",
        headers: getAdminHeaders(),
    });

    if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? "Не удалось выпустить новый токен");
    }

    const json = (await res.json()) as { data: IncomingCallDevice; token: string };
    return { device: json.data, token: json.token };
}

export async function updateIncomingCallDevice(
    id: string,
    payload: { label?: string; is_active?: boolean },
): Promise<IncomingCallDevice> {
    const res = await fetch(`${API_BASE}/admin/incoming-call-devices/${id}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error("Не удалось обновить устройство");
    }

    const json = (await res.json()) as { data: IncomingCallDevice };
    return json.data;
}

export async function deleteIncomingCallDevice(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/incoming-call-devices/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
    });

    if (!res.ok) {
        throw new Error("Не удалось удалить устройство");
    }
}
