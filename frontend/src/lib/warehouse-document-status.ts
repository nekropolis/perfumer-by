/**
 * Статусы складских документов (значения полей `status` в БД; совпадают с бэкендом:
 * `StockWriteoff::STATUS_*`, `StockReceipt::STATUS_*`).
 */
export const STOCK_WRITEOFF_STATUS = {
    POSTED: "posted",
    REVERSED: "reversed",
    WRITTEN_OFF: "written_off",
} as const;

export type StockWriteoffStatus = (typeof STOCK_WRITEOFF_STATUS)[keyof typeof STOCK_WRITEOFF_STATUS];

/** Код статуса → подпись для UI (как на бэкенде: `StockWriteoff::STATUS_LABELS`). */
export const STOCK_WRITEOFF_STATUS_LABELS: Record<StockWriteoffStatus, string> = {
    [STOCK_WRITEOFF_STATUS.POSTED]: "Проведено",
    [STOCK_WRITEOFF_STATUS.REVERSED]: "Отменена",
    [STOCK_WRITEOFF_STATUS.WRITTEN_OFF]: "Списан",
};

export function getStockWriteoffStatusLabel(status: string | null | undefined): string {
    if (status != null && status in STOCK_WRITEOFF_STATUS_LABELS) {
        return STOCK_WRITEOFF_STATUS_LABELS[status as StockWriteoffStatus];
    }
    return status?.trim() ? status : "—";
}

export const STOCK_RECEIPT_STATUS = {
    DRAFT: "draft",
    POSTED: "posted",
} as const;

export type StockReceiptStatus = (typeof STOCK_RECEIPT_STATUS)[keyof typeof STOCK_RECEIPT_STATUS];

export const STOCK_RECEIPT_STATUS_LABELS: Record<StockReceiptStatus, string> = {
    [STOCK_RECEIPT_STATUS.DRAFT]: "Черновик",
    [STOCK_RECEIPT_STATUS.POSTED]: "Оприходован",
};

export function getStockReceiptStatusLabel(status: string | null | undefined): string {
    if (status != null && status in STOCK_RECEIPT_STATUS_LABELS) {
        return STOCK_RECEIPT_STATUS_LABELS[status as StockReceiptStatus];
    }
    return status?.trim() ? status : "—";
}
