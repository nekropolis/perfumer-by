import { getAuthToken } from "@/lib/auth-token";
import type {
    ApiResponse,
    ImportResponse,
    ParseJobConfig,
    VanilleParseResponse,
} from "@/types/Vanille";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

function parseJsonResponse<T>(text: string): T {
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(text || "Сервер вернул не JSON");
    }
}

async function adminVanilleFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            ...getAdminHeaders(),
            ...(options?.headers || {}),
        },
        cache: "no-store",
    });

    const text = await res.text();
    const data = parseJsonResponse<T & { message?: string }>(text);

    if (!res.ok) {
        throw new Error(data.message || `Vanille API error: ${res.status}`);
    }

    return data;
}

export async function fetchVanilleSupplierProducts(params?: {
    search?: string;
    linked?: string;
    active?: string;
    page?: number;
}): Promise<ApiResponse> {
    const searchParams = new URLSearchParams();

    if (params?.search) {
        searchParams.set("search", params.search);
    }

    if (params?.linked) {
        searchParams.set("linked", params.linked);
    }

    if (params?.active) {
        searchParams.set("active", params.active);
    }

    if (params?.page) {
        searchParams.set("page", String(params.page));
    }

    const query = searchParams.toString();

    return adminVanilleFetch<ApiResponse>(
        `/admin/import-export/vanille/supplier-products${query ? `?${query}` : ""}`
    );
}

export async function importParsedVanilleProducts(): Promise<ImportResponse> {
    return adminVanilleFetch<ImportResponse>(
        "/admin/import-export/vanille/import-parsed-products",
        {
            method: "POST",
        }
    );
}

export async function runVanilleParseJob({
    path,
    defaultError,
    paginated = false,
    body,
}: ParseJobConfig): Promise<VanilleParseResponse | null> {
    if (!paginated) {
        return adminVanilleFetch<VanilleParseResponse>(path, {
            method: "POST",
            body: JSON.stringify(body ?? {}),
        });
    }

    let offset = 0;
    const limit = 20;
    const maxLinks = 100;
    let done = false;
    let finalData: VanilleParseResponse | null = null;
    const combinedLog: string[] = [];

    while (!done) {
        const data = await adminVanilleFetch<VanilleParseResponse>(path, {
            method: "POST",
            body: JSON.stringify({
                offset,
                limit,
                max_links: maxLinks,
                ...(body ?? {}),
            }),
        });

        if (Array.isArray(data.log)) {
            combinedLog.push(...data.log);
        }

        finalData = {
            ...data,
            log: combinedLog,
        };

        done = !!data.done;
        offset = data.next_offset ?? offset + limit;
    }

    if (!finalData) {
        throw new Error(defaultError);
    }

    return finalData;
}

export async function parseVanilleBrands(): Promise<VanilleParseResponse | null> {
    try {
        return await runVanilleParseJob({
            path: "/admin/import-export/vanille/parse-brands",
            defaultError: "Ошибка парсинга брендов",
        });
    } catch (error: unknown) {
        throw new Error(
            error instanceof Error ? error.message : "Ошибка парсинга брендов"
        );
    }
}

export async function collectVanilleProductLinks(): Promise<VanilleParseResponse | null> {
    try {
        return await runVanilleParseJob({
            path: "/admin/import-export/vanille/collect-links",
            defaultError: "Ошибка сбора ссылок",
            paginated: true,
        });
    } catch (error: unknown) {
        throw new Error(
            error instanceof Error ? error.message : "Ошибка сбора ссылок"
        );
    }
}

export async function parseVanilleProducts(): Promise<VanilleParseResponse | null> {
    try {
        return await runVanilleParseJob({
            path: "/admin/import-export/vanille/parse-products",
            defaultError: "Ошибка массового парсинга карточек",
            paginated: true,
        });
    } catch (error: unknown) {
        throw new Error(
            error instanceof Error
                ? error.message
                : "Ошибка массового парсинга карточек"
        );
    }
}
