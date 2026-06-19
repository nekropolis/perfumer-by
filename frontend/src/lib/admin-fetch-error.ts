type LaravelErrorBody = {
    message?: string;
    errors?: Record<string, string[] | string>;
};

export function parseAdminFetchErrorMessage(status: number, raw: string, fallback: string): string {
    if (!raw.trim()) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(raw) as LaravelErrorBody;

        if (typeof parsed.message === "string" && parsed.message.trim() !== "") {
            return parsed.message.trim();
        }

        if (parsed.errors && typeof parsed.errors === "object") {
            const parts: string[] = [];
            for (const value of Object.values(parsed.errors)) {
                if (Array.isArray(value)) {
                    for (const item of value) {
                        if (typeof item === "string" && item.trim() !== "") {
                            parts.push(item.trim());
                        }
                    }
                } else if (typeof value === "string" && value.trim() !== "") {
                    parts.push(value.trim());
                }
            }
            if (parts.length > 0) {
                return parts.join(" ");
            }
        }
    } catch {
        const preview = raw.replace(/\s+/g, " ").trim().slice(0, 200);
        if (preview.startsWith("<!DOCTYPE") || preview.startsWith("<html")) {
            return `${fallback} (${status}). Сервер вернул HTML вместо JSON — проверьте авторизацию или логи backend.`;
        }
        if (preview) {
            return preview;
        }
    }

    return fallback;
}

export async function readAdminJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
    const raw = await res.text();

    if (!res.ok) {
        throw new Error(parseAdminFetchErrorMessage(res.status, raw, fallbackError));
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const looksLikeJson =
        contentType.includes("application/json") ||
        raw.trim().startsWith("{") ||
        raw.trim().startsWith("[");

    if (!looksLikeJson) {
        throw new Error(
            parseAdminFetchErrorMessage(
                res.status,
                raw,
                `${fallbackError}. Сервер вернул не-JSON ответ.`
            )
        );
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        throw new Error(`${fallbackError}. Не удалось разобрать ответ сервера.`);
    }
}
