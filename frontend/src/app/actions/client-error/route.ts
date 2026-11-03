import { getApiBase } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ClientErrorBody = {
    name?: unknown;
    message?: unknown;
    stack?: unknown;
    digest?: unknown;
    path?: unknown;
    source?: unknown;
};

function clip(value: unknown, length: number): string {
    if (typeof value !== "string") {
        return "";
    }
    const text = value.trim();
    return text.length > length ? `${text.slice(0, length)}…` : text;
}

async function forwardToBackend(payload: Record<string, string | null>): Promise<void> {
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
        // Полный стек уже записан в лог Next.
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Клиентская граница ошибки. Путь вне /api, чтобы nginx отдал его Next, а не Laravel.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 8_000) {
        return new NextResponse(null, { status: 413 });
    }

    let body: ClientErrorBody = {};
    try {
        const parsed: unknown = await request.json();
        if (parsed && typeof parsed === "object") {
            body = parsed as ClientErrorBody;
        }
    } catch {
        return new NextResponse(null, { status: 400 });
    }

    const name = clip(body.name, 160) || "Error";
    const message = clip(body.message, 500) || "Unknown error";
    const stack = clip(body.stack, 1500);
    const path = clip(body.path, 512) || "/";
    const digest = clip(body.digest, 128);
    const source = clip(body.source, 32) || "segment";

    console.error(
        JSON.stringify({
            source: "client-error",
            boundary: source,
            path,
            name,
            message,
            digest: digest || null,
            stack: stack || null,
        }),
    );

    void forwardToBackend({
        digest: digest || null,
        path,
        method: "GET",
        routerKind: "App Router",
        routePath: path,
        routeType: "client",
        name,
        message: clip(stack ? `${message}\n${stack}` : message, 1000),
    });

    return new NextResponse(null, { status: 204 });
}
