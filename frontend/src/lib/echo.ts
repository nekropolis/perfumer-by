import Echo from "laravel-echo";
import Pusher from "pusher-js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

let echoInstance: Echo<"reverb"> | null = null;

/** Host only — без http://, без порта и пути (как REVERB_HOST в Laravel). */
function normalizeReverbHost(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
        return "";
    }
    try {
        if (trimmed.includes("://")) {
            return new URL(trimmed).hostname;
        }
    } catch {
        // fall through
    }
    return trimmed.replace(/\/.*$/, "").split(":")[0] ?? "";
}

function getReverbConfig() {
    const key = process.env.NEXT_PUBLIC_REVERB_APP_KEY;
    const host = normalizeReverbHost(process.env.NEXT_PUBLIC_REVERB_HOST ?? "");
    const port = Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 8080);
    const scheme = (process.env.NEXT_PUBLIC_REVERB_SCHEME ?? "http").replace(/:\/\//, "");

    if (!key || !host || !API_BASE) {
        return null;
    }

    return { key, host, port, scheme };
}

export function getAdminEcho(token: string): Echo<"reverb"> | null {
    if (typeof window === "undefined") {
        return null;
    }

    const config = getReverbConfig();
    if (!config) {
        return null;
    }

    if (echoInstance) {
        return echoInstance;
    }

    (window as Window & { Pusher?: typeof Pusher }).Pusher = Pusher;

    const useTls = config.scheme === "https";

    echoInstance = new Echo({
        broadcaster: "reverb",
        key: config.key,
        wsHost: config.host,
        wsPort: config.port,
        wssPort: config.port,
        forceTLS: useTls,
        enabledTransports: useTls ? ["wss"] : ["ws"],
        authEndpoint: `${API_BASE}/broadcasting/auth`,
        auth: {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        },
    });

    if (process.env.NODE_ENV === "development") {
        const pusher = echoInstance.connector.pusher;
        pusher.connection.bind("unavailable", () => {
            console.warn(
                "[Echo] Reverb недоступен на",
                `${useTls ? "wss" : "ws"}://${config.host}:${config.port}`,
                "— запустите: cd backend && php artisan reverb:start",
            );
        });
    }

    return echoInstance;
}

export function disconnectAdminEcho(): void {
    if (echoInstance) {
        echoInstance.disconnect();
        echoInstance = null;
    }
}

export type SendToCrmEventPayload = {
    device_id: string;
    device_label: string;
    phone: string;
    trigger: "manual";
    received_at: number;
    matched_user: { id: number; name: string | null } | null;
    customer_name: string | null;
    orders: {
        completed: number;
        active: number;
        cancelled: number;
    };
};
