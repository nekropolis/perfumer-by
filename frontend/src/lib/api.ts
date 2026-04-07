const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || "http://192.168.0.25/api";

export async function apiFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
    }

    return res.json();
}