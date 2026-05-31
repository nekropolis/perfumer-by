export type ProductStatusCode = "new" | "hit" | "discount";

type ProductStatusesInput = {
    isNew: boolean;
    isHit: boolean;
    hasDiscount: boolean;
};

type ProductStatusMeta = {
    code: ProductStatusCode;
    shortLabel: string;
    label: string;
    adminClassName: string;
    storefrontClassName: string;
};

const STATUS_MAP: Record<ProductStatusCode, ProductStatusMeta> = {
    new: {
        code: "new",
        shortLabel: "NEW",
        label: "Новинка",
        adminClassName: "bg-blue-50 text-blue-700 border-blue-100",
        storefrontClassName: "bg-[#14110F] text-[#E7DECF]",
    },
    hit: {
        code: "hit",
        shortLabel: "HIT",
        label: "Хит",
        adminClassName: "bg-violet-50 text-violet-700 border-violet-100",
        storefrontClassName: "bg-[#C9A45C] text-[#14110F]",
    },
    discount: {
        code: "discount",
        shortLabel: "SALE",
        label: "Акция",
        adminClassName: "bg-rose-50 text-rose-700 border-rose-100",
        storefrontClassName: "bg-[#8E2C3B] text-[#F6E7D6]",
    },
};

export const PRODUCT_STATUS_FILTER_OPTIONS = [
    { value: "new", label: "Новинки" },
    { value: "hit", label: "Хиты" },
    { value: "discount", label: "Акции (со скидкой)" },
] as const;

export function resolveProductStatuses(input: ProductStatusesInput): ProductStatusMeta[] {
    const statuses: ProductStatusMeta[] = [];
    if (input.isNew) statuses.push(STATUS_MAP.new);
    if (input.isHit) statuses.push(STATUS_MAP.hit);
    if (input.hasDiscount) statuses.push(STATUS_MAP.discount);
    return statuses;
}
