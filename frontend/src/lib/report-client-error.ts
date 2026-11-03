type ClientErrorSource = "segment" | "global";

export type ClientErrorReport = {
    name: string;
    message: string;
    stack: string | null;
    digest: string | null;
    path: string;
    source: ClientErrorSource;
};

function clip(value: string, length: number): string {
    return value.length > length ? `${value.slice(0, length)}…` : value;
}

/** Отправляет ошибку границы React на сервер Next. На SSR не вызывается. */
export function reportClientError(error: Error & { digest?: string }, source: ClientErrorSource): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const payload: ClientErrorReport = {
            name: clip(error.name || "Error", 160),
            message: clip(error.message || "Unknown error", 500),
            stack: error.stack ? clip(error.stack, 1500) : null,
            digest: error.digest ? clip(error.digest, 128) : null,
            path: clip(window.location.pathname || "/", 512),
            source,
        };
        const body = JSON.stringify(payload);

        if (typeof navigator.sendBeacon === "function") {
            const sent = navigator.sendBeacon(
                "/actions/client-error",
                new Blob([body], { type: "application/json" }),
            );
            if (sent) {
                return;
            }
        }

        void fetch("/actions/client-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
        }).catch(() => {});
    } catch {
        // Страница ошибки не должна падать из-за отчёта.
    }
}
