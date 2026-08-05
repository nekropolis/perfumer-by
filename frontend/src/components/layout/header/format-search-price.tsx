import type { ReactNode } from "react";
import type { HeaderSearchItem } from "@/components/layout/header/types";

function positivePrice(value: string | null | undefined): string | null {
    if (value == null) {
        return null;
    }
    const trimmed = String(value).trim();
    if (trimmed === "") {
        return null;
    }
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
        return null;
    }
    return trimmed;
}

export function formatSearchPrice(item: HeaderSearchItem): ReactNode {
    const min = positivePrice(item.price_range?.min ?? null);
    const max = positivePrice(item.price_range?.max ?? null);
    const stockTotal = item.stock_total ?? 0;
    /** Как в каталоге: `stock_total` и флаг `is_out_of_stock` согласованы с каналом поставщика (см. syncProductStockFlagsByProductId). */
    const listingAvailable = stockTotal > 0 || item.is_preorder_available;
    const awaitingArrival =
        !listingAvailable &&
        (Boolean(item.is_out_of_stock) || Boolean(min || max));

    if (awaitingArrival) {
        return "Ожидается поступление";
    }

    if (item.is_preorder_available && !min && !max) {
        return "Предзаказ";
    }

    if (!min && !max) {
        return "Цена уточняется";
    }

    const normalize = (value: string | null) =>
        value ? value.replace(".", ",") : null;

    const nMin = normalize(min);
    const nMax = normalize(max);

    if (nMin && nMax && nMin !== nMax) {
        return (
            <strong>
                {nMin} - {nMax} <small>BYN</small>
            </strong>
        );
    }

    return (
        <strong>
            {nMin || nMax} <small>BYN</small>
        </strong>
    );
}
