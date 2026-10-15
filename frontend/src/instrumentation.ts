import type { Instrumentation } from "next";

import { getApiBase } from "@/lib/api";

type FrontendErrorPayload = {
    digest: string | null;
    path: string;
    method: string;
    routerKind: string;
    routePath: string;
    routeType: string;
    name: string;
    message: string;
};

function truncate(value: string, length: number): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized;
}

async function sendToBackend(payload: FrontendErrorPayload): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
        await fetch(`${getApiBase()}/internal/frontend-errors`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } catch {
        // PM2 still retains the local JSON log when the backend is unavailable.
    } finally {
        clearTimeout(timeout);
    }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const digest =
        typeof error === "object" &&
        error !== null &&
        "digest" in error &&
        typeof error.digest === "string"
            ? error.digest
            : null;
    const payload: FrontendErrorPayload = {
        digest,
        path: request.path.split("?")[0],
        method: request.method,
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
        name: normalizedError.name,
        message: truncate(normalizedError.message, 500),
    };

    console.error(JSON.stringify(payload));
    void sendToBackend(payload);
};
