import { throwApiError } from "@/lib/auth-api";
import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type AttachDiscountCardResponse = {
    data: {
        id: number;
        card_number: string;
        discount_percent: string;
        status: string;
    };
    link_status?: string;
    message?: string;
};

export async function attachMyLoyaltyCardByNumber(number: string): Promise<AttachDiscountCardResponse> {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/loyalty/cards/attach`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ number: number.trim() }),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Привязка карты: ${res.status}`);
    }

    return res.json();
}
