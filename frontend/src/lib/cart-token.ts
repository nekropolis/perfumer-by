const CART_TOKEN_KEY = "cart_token";

function generateCartToken(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getCartToken(): string {
    if (typeof window === "undefined") {
        return "";
    }

    let token = localStorage.getItem(CART_TOKEN_KEY);

    if (!token) {
        token = generateCartToken();
        localStorage.setItem(CART_TOKEN_KEY, token);
    }

    return token;
}