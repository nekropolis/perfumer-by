import type { ReactNode } from "react";
import type { HeaderSearchItem } from "@/components/layout/header/types";

export function formatSearchPrice(item: HeaderSearchItem): ReactNode {
    const min = item.price_range?.min ?? null;
    const max = item.price_range?.max ?? null;
    const stockTotal = item.stock_total ?? 0;
    /** Как в каталоге: `stock_total` и флаг `is_out_of_stock` согласованы с каналом поставщика (см. syncProductStockFlagsByProductId). */
    const listingAvailable = stockTotal > 0 || item.is_preorder_available;
    const awaitingArrival =
        !listingAvailable &&
        (Boolean(item.is_out_of_stock) || Boolean(min || max));

    if (item.is_preorder_available && !min && !max) {
        return "Предзаказ";
    }

    if (!min && !max) {
        if (awaitingArrival) {
            return "Ожидается поступление";
        }
        return "Цена уточняется";
    }

    const normalize = (value: string | null) =>
        value ? value.replace(".", ",") : null;

    const nMin = normalize(min);
    const nMax = normalize(max);

    const priceBlock =
        nMin && nMax && nMin !== nMax ? (
            <strong>
                {nMin} - {nMax} <small>BYN</small>
            </strong>
        ) : (
            <strong>
                {nMin || nMax} <small>BYN</small>
            </strong>
        );

    if (awaitingArrival) {
        return (
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                {priceBlock}
                <span className="font-normal text-[var(--text-secondary)]">
                    · Ожидается поступление
                </span>
            </span>
        );
    }

    return priceBlock;
}
