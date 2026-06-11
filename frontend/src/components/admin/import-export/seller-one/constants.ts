export const SELLER_ONE_BATCH_LIMIT = 1000;
export const SELLER_ONE_FILE_ACCEPT = ".xls,.xlsx";
export const SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS = 400;
export const SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS = 350;

export const STATUS_OPTIONS = [
    { value: "confirmed", label: "Связанные" },
    { value: "found_unconfirmed", label: "Есть кандидат" },
    { value: "unlinked", label: "Не связанные" },
    { value: "new", label: "Новые" },
    { value: "parsing_inactive", label: "Парсинг выкл." },
] as const;

export type SellerOneStatusFilter =
    | ""
    | "confirmed"
    | "found_unconfirmed"
    | "unlinked"
    | "new"
    | "parsing_inactive";

export const STOCK_FILTER_OPTIONS = [
    { value: "in_stock", label: "В наличии" },
    { value: "out_of_stock", label: "Нет в наличии" },
] as const;

export type SellerOneStockFilter = "" | "in_stock" | "out_of_stock";
