const AUTH_TOKEN_KEY = "auth_token";

export function getAuthToken(): string {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function setAuthToken(token: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(AUTH_TOKEN_KEY);
}