import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type CreateOneClickOrderPayload = {
    variant_id: number;
    product_id?: number | null;
    customer_name: string;
    phone: string;
    phone_plain_digits?: boolean;
    consent_offer: boolean;
    consent_privacy: boolean;
};

export type CreateOneClickOrderResponse = {
    data: {
        id: number;
        customer_name: string | null;
        phone: string;
        status: string;
        total: string;
    };
    message: string;
};

function getHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function createOneClickOrder(
    payload: CreateOneClickOrderPayload,
): Promise<CreateOneClickOrderResponse> {
    const res = await fetch(`${API_BASE}/one-click-orders`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    let parsed: unknown = null;
    try {
        parsed = await res.json();
    } catch {
        parsed = null;
    }

    if (!res.ok) {
        let message = `One-click order API error: ${res.status}`;
        if (
            parsed &&
            typeof parsed === "object" &&
            "message" in parsed &&
            typeof (parsed as { message?: unknown }).message === "string"
        ) {
            message = (parsed as { message: string }).message;
        }
        const error = new Error(message) as Error & {
            status?: number;
            errors?: Record<string, string[]>;
        };
        error.status = res.status;
        if (
            parsed &&
            typeof parsed === "object" &&
            "errors" in (parsed as Record<string, unknown>)
        ) {
            error.errors = (parsed as { errors?: Record<string, string[]> }).errors;
        }
        throw error;
    }

    return parsed as CreateOneClickOrderResponse;
}
