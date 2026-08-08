import type {
    ProductSeoField,
    ProductSeoFieldState,
    ProductSeoGeneration,
} from "@/lib/admin-products-api";

export const PRODUCT_SEO_TERMINAL_STATUSES = ["completed", "failed", "conflicted"] as const;

export function isProductSeoTerminal(status: ProductSeoGeneration["status"]): boolean {
    return PRODUCT_SEO_TERMINAL_STATUSES.includes(
        status as (typeof PRODUCT_SEO_TERMINAL_STATUSES)[number],
    );
}

export function defaultProductSeoFields(
    fields: Record<ProductSeoField, ProductSeoFieldState>,
    order: ProductSeoField[],
): ProductSeoField[] {
    return order.filter((field) => fields[field].state === "new");
}

export function hasManualProductSeoFields(
    selected: ProductSeoField[],
    fields: Record<ProductSeoField, ProductSeoFieldState>,
): boolean {
    return selected.some((field) => fields[field].state === "manually_changed");
}

type PollOptions = {
    fetchStatus: (signal: AbortSignal) => Promise<ProductSeoGeneration>;
    onUpdate: (generation: ProductSeoGeneration) => void;
    signal: AbortSignal;
    intervalMs?: number;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

export async function pollProductSeoGeneration({
    fetchStatus,
    onUpdate,
    signal,
    intervalMs = 3000,
    wait = waitForDelay,
}: PollOptions): Promise<ProductSeoGeneration | null> {
    while (!signal.aborted) {
        const generation = await fetchStatus(signal);
        if (signal.aborted) {
            return null;
        }

        onUpdate(generation);
        if (isProductSeoTerminal(generation.status)) {
            return generation;
        }

        await wait(intervalMs, signal);
    }

    return null;
}

function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = window.setTimeout(resolve, milliseconds);
        signal.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timer);
                resolve();
            },
            { once: true },
        );
    });
}
