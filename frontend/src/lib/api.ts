/** Laravel API base (…/api). На SSR приоритет у API_URL / INTERNAL_API_URL, иначе NEXT_PUBLIC_API_URL. */
export function getApiBase(): string {
    const isBrowser = typeof window !== "undefined";
    const internal = process.env.API_URL?.trim() || process.env.INTERNAL_API_URL?.trim();
    const pub = process.env.NEXT_PUBLIC_API_URL?.trim();

    if (isBrowser) {
        if (!pub) {
            throw new Error("NEXT_PUBLIC_API_URL is not defined");
        }
        return pub.replace(/\/$/, "");
    }

    const base = internal || pub;
    if (!base) {
        throw new Error(
            "Задайте API_URL или NEXT_PUBLIC_API_URL (для SSR на том же хосте часто нужен API_URL=http://127.0.0.1:8000/api)"
        );
    }
    return base.replace(/\/$/, "");
}

export async function apiFetch<T>(path: string): Promise<T> {
    const base = getApiBase();
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

    const res = await fetch(url, {
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`API error: ${res.status} ${url}`);
    }

    const raw = await res.text();
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const looksLikeJson = contentType.includes("application/json") || raw.trim().startsWith("{") || raw.trim().startsWith("[");

    if (!looksLikeJson) {
        const preview = raw.slice(0, 180);
        if (preview.toUpperCase().includes("NO HOST FOUND")) {
            throw new Error(
                `API returned "NO HOST FOUND" for ${url}. Configure frontend SSR env API_URL (e.g. http://127.0.0.1:8000/api) instead of unreachable host.`
            );
        }
        throw new Error(`API returned non-JSON response for ${url}: ${preview}`);
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        throw new Error(`Failed to parse API JSON for ${url}: ${raw.slice(0, 180)}`);
    }
}