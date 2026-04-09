const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type RequestCodeResponse = {
    message: string;
    dev_code: string;
    phone: string;
};

export type VerifyCodeResponse = {
    message: string;
    token: string;
    user: {
        id: number;
        name: string | null;
        phone: string;
        role?: string;
    };
};

export type MeResponse = {
    data: {
        id: number;
        name: string | null;
        email?: string | null;
        phone: string;
        phone_verified_at?: string | null;
        role?: string;
    } | null;
};

export async function requestPhoneCode(phone: string): Promise<RequestCodeResponse> {
    const res = await fetch(`${API_BASE}/auth/request-code`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Request code API error: ${res.status}`);
    }

    return res.json();
}

export async function verifyPhoneCode(
    phone: string,
    code: string,
    name?: string
): Promise<VerifyCodeResponse> {
    const res = await fetch(`${API_BASE}/auth/verify-code`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, code, name }),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Verify code API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchMe(token: string): Promise<MeResponse> {
    const res = await fetch(`${API_BASE}/auth/me`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Me API error: ${res.status}`);
    }

    return res.json();
}