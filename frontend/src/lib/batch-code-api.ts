import { apiFetch, getApiBase } from "@/lib/api";
import type {
    BatchCodeBrand,
    BatchCodeBrandsResponse,
    BatchCodeCheckData,
    BatchCodeCheckResponse,
    BatchCodeSubmissionInput,
} from "@/types/batch-code";

export class BatchCodeRequestError extends Error {
    readonly status: number;
    readonly errors?: Record<string, string[]>;

    constructor(message: string, status: number, errors?: Record<string, string[]>) {
        super(message);
        this.name = "BatchCodeRequestError";
        this.status = status;
        this.errors = errors;
    }
}

function extractValidationErrors(payload: unknown): Record<string, string[]> | undefined {
    if (!payload || typeof payload !== "object" || !("errors" in payload)) {
        return undefined;
    }
    const errors = (payload as { errors?: unknown }).errors;
    if (!errors || typeof errors !== "object" || Array.isArray(errors)) {
        return undefined;
    }
    const out: Record<string, string[]> = {};
    for (const key of Object.keys(errors)) {
        const val = (errors as Record<string, unknown>)[key];
        if (Array.isArray(val)) {
            out[key] = val.filter((item): item is string => typeof item === "string");
        } else if (typeof val === "string") {
            out[key] = [val];
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

async function parseBatchCodeError(res: Response, fallback: string): Promise<never> {
    const text = await res.text();
    try {
        const payload = text ? JSON.parse(text) : null;
        const message =
            typeof payload?.message === "string" && payload.message.trim()
                ? payload.message.trim()
                : fallback;
        throw new BatchCodeRequestError(message, res.status, extractValidationErrors(payload));
    } catch (e) {
        if (e instanceof BatchCodeRequestError) {
            throw e;
        }
        throw new BatchCodeRequestError(text || fallback, res.status);
    }
}

export async function fetchBatchCodeBrands(): Promise<BatchCodeBrand[]> {
    try {
        const isServer = typeof window === "undefined";
        const res = await apiFetch<BatchCodeBrandsResponse>(
            "/batch-code/brands",
            isServer ? { next: { revalidate: 3600, tags: ["batch-code-brands"] } } : {},
        );
        return res.data ?? [];
    } catch {
        return [];
    }
}

export async function checkBatchCode(brandSlug: string, code: string): Promise<BatchCodeCheckData> {
    const res = await fetch(`${getApiBase()}/batch-code/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brand_slug: brandSlug, code: code.trim() }),
        cache: "no-store",
    });

    if (!res.ok) {
        return parseBatchCodeError(res, "Не удалось проверить код");
    }

    const json = (await res.json()) as BatchCodeCheckResponse;
    return json.data;
}

export async function submitBatchCodeFeedback(input: BatchCodeSubmissionInput): Promise<void> {
    const body: Record<string, unknown> = {
        brand_slug: input.brand_slug,
        code: input.code.trim(),
        printed_date: input.printed_date,
        date_kind: input.date_kind,
        consent: true,
    };
    const email = input.email?.trim();
    if (email) {
        body.email = email;
    }

    const res = await fetch(`${getApiBase()}/batch-code/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    if (!res.ok) {
        return parseBatchCodeError(res, "Не удалось отправить данные");
    }
}

export function firstBatchCodeValidationMessage(error: BatchCodeRequestError): string {
    if (error.errors) {
        const firstKey = Object.keys(error.errors)[0];
        const first = firstKey ? error.errors[firstKey]?.[0] : null;
        if (first?.trim()) {
            return first.trim();
        }
    }
    return error.message;
}
