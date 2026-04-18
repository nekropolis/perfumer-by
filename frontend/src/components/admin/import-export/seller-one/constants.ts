export const SELLER_ONE_BATCH_LIMIT = 1000;
export const SELLER_ONE_FILE_ACCEPT = ".xls,.xlsx";
export const SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS = 400;
export const SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS = 350;

export const STATUS_OPTIONS = [
    { value: "confirmed", label: "Связанные" },
    { value: "found_unconfirmed", label: "Есть кандидат" },
    { value: "unlinked", label: "Не связанные" },
    { value: "new", label: "Новые" },
] as const;

export type SellerOneStatusFilter =
    | ""
    | "confirmed"
    | "found_unconfirmed"
    | "unlinked"
    | "new";
