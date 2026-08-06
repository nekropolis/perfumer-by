export const SELLER_ONE_BATCH_LIMIT = 1000;
export const SELLER_ONE_FILE_ACCEPT = ".xls,.xlsx";
export const SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS = 400;
export const SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS = 350;
/** Код поставщика EDP (бывший Seller One / supplier-price-xls). */
export const SELLER_ONE_SUPPLIER_CODE = "edp";

export const PRICE_PARSE_SUPPLIERS = [
    { code: "edp", name: "EDP" },
    { code: "lagdos", name: "Lagdos" },
] as const;

export type PriceParseSupplierCode = (typeof PRICE_PARSE_SUPPLIERS)[number]["code"];

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
    { value: "set", label: "Set" },
] as const;

export type SellerOneStockFilter = "" | "in_stock" | "out_of_stock" | "set";
