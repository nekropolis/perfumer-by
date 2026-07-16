import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Same tags as backend CatalogStorefrontRevalidationService::CATALOG_TAGS */
const CATALOG_TAGS = [
    "catalog",
    "catalog-products",
    "catalog-brands",
    "catalog-brand-detail",
    "catalog-filters",
    "catalog-product-detail",
    "catalog-bootstrap",
    "catalog-search",
] as const;

function resolveApiBase(): string | null {
    // Server-side: prefer loopback (see PRODUCTION.md / .env.example), avoid hairpin via public host.
    const internal =
        process.env.API_URL?.trim() || process.env.INTERNAL_API_URL?.trim();
    if (internal) {
        return internal.replace(/\/$/, "");
    }
    const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
    return pub ? pub.replace(/\/$/, "") : null;
}

async function assertAdminBearer(
    request: NextRequest,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
        return { ok: false, status: 401, message: "Unauthorized" };
    }

    const apiBase = resolveApiBase();
    if (!apiBase) {
        return { ok: false, status: 500, message: "API_URL / NEXT_PUBLIC_API_URL is not defined" };
    }

    let meRes: Response;
    try {
        meRes = await fetch(`${apiBase}/auth/me`, {
            headers: { Authorization: authHeader },
            cache: "no-store",
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "auth/me fetch failed";
        return { ok: false, status: 502, message: `Не удалось проверить сессию: ${message}` };
    }

    if (!meRes.ok) {
        return { ok: false, status: 401, message: "Unauthorized" };
    }

    let payload: { data?: { actor_type?: string; role?: string } | null };
    try {
        payload = (await meRes.json()) as typeof payload;
    } catch {
        return { ok: false, status: 502, message: "Некорректный ответ /auth/me" };
    }

    const user = payload.data;
    if (!user || user.actor_type !== "staff" || user.role !== "admin") {
        return { ok: false, status: 403, message: "Доступ запрещен" };
    }

    return { ok: true };
}

function revalidateCatalogTags(): void {
    for (const tag of CATALOG_TAGS) {
        try {
            revalidateTag(tag, { expire: 0 });
        } catch {
            // Fallback for runtimes that reject the object profile form.
            revalidateTag(tag, "max");
        }
    }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const auth = await assertAdminBearer(request);
        if (!auth.ok) {
            return NextResponse.json({ message: auth.message }, { status: auth.status });
        }

        revalidateCatalogTags();

        return NextResponse.json({
            revalidated: true,
            tags: [...CATALOG_TAGS],
            now: Date.now(),
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Revalidate failed";
        return NextResponse.json({ message }, { status: 500 });
    }
}
