const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type RequestCodeResponse = {
    message: string;
    dev_code?: string;
    phone: string;
    delivery_channel?: "viber" | "sms" | "manual";
    delivery_status?: string;
    fallback_used?: boolean;
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

export class ApiRequestError extends Error {
    code?: string;
    status: number;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "ApiRequestError";
        this.status = status;
        this.code = code;
    }
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
    const text = await res.text();
    try {
        const payload = text ? JSON.parse(text) : null;
        throw new ApiRequestError(
            payload?.message || fallback,
            res.status,
            typeof payload?.code === "string" ? payload.code : undefined
        );
    } catch {
        throw new ApiRequestError(text || fallback, res.status);
    }
}

export async function requestPhoneCode(phone: string, captchaToken?: string): Promise<RequestCodeResponse> {
    const res = await fetch(`${API_BASE}/auth/request-code`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, captcha_token: captchaToken || undefined }),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Request code API error: ${res.status}`);
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
        return throwApiError(res, `Verify code API error: ${res.status}`);
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
        return { data: null };
    }

    return res.json();
}