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

export type AuthSuccessResponse = {
    message: string;
    token: string;
    user: {
        id: number;
        name: string | null;
        phone: string;
        role?: string;
    };
};

export type VerifyCodeResponse = AuthSuccessResponse;

export type OtpSentResponse = {
    message: string;
    phone: string;
    dev_code?: string;
    dev_password?: string;
};

export type AuthUserProfile = {
    id: number;
    name: string | null;
    first_name?: string | null;
    last_name?: string | null;
    patronymic?: string | null;
    email?: string | null;
    birth_date?: string | null;
    phone: string;
    phone_verified_at?: string | null;
    role?: string;
    discount_cards?: {
        id: number;
        number: string;
        discount_percent: string;
        is_active: boolean;
    }[];
};

export type MeResponse = {
    data: AuthUserProfile | null;
};

export type UpdateProfilePayload = {
    first_name?: string | null;
    last_name?: string | null;
    patronymic?: string | null;
    email?: string | null;
    birth_date?: string | null;
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

export async function throwApiError(res: Response, fallback: string): Promise<never> {
    const text = await res.text();
    try {
        const payload = text ? JSON.parse(text) : null;
        throw new ApiRequestError(
            payload?.message || fallback,
            res.status,
            typeof payload?.code === "string" ? payload.code : undefined
        );
    } catch (e) {
        if (e instanceof ApiRequestError) {
            throw e;
        }
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

export async function registerAccount(
    name: string,
    phone: string,
    password: string,
    passwordConfirmation: string,
    captchaToken?: string
): Promise<OtpSentResponse> {
    const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            phone,
            password,
            password_confirmation: passwordConfirmation,
            captcha_token: captchaToken || undefined,
        }),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Register API error: ${res.status}`);
    }

    return res.json();
}

export async function verifyRegistration(phone: string, code: string): Promise<AuthSuccessResponse> {
    const res = await fetch(`${API_BASE}/auth/register/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Register verify API error: ${res.status}`);
    }

    return res.json();
}

export async function loginWithPassword(
    phone: string,
    password: string,
    captchaToken?: string
): Promise<AuthSuccessResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password, captcha_token: captchaToken || undefined }),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Login API error: ${res.status}`);
    }

    return res.json();
}

export async function forgotPassword(phone: string, captchaToken?: string): Promise<OtpSentResponse> {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, captcha_token: captchaToken || undefined }),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Forgot password API error: ${res.status}`);
    }

    return res.json();
}

export async function requestPasswordChange(
    token: string,
    password: string,
    passwordConfirmation: string
): Promise<OtpSentResponse> {
    const res = await fetch(`${API_BASE}/auth/password/change-request`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            password,
            password_confirmation: passwordConfirmation,
        }),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Password change request API error: ${res.status}`);
    }

    return res.json();
}

export async function verifyPasswordChange(token: string, code: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/auth/password/change-verify`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Password change verify API error: ${res.status}`);
    }

    return res.json();
}

export async function updateProfile(
    token: string,
    payload: UpdateProfilePayload
): Promise<MeResponse & { message?: string }> {
    const res = await fetch(`${API_BASE}/auth/profile`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        return throwApiError(res, `Update profile API error: ${res.status}`);
    }

    return res.json();
}