import { resolveProductStatuses } from "@/lib/product-statuses";

type Props = {
    isNew: boolean;
    isHit: boolean;
    hasPromotion: boolean;
    isOutOfStock?: boolean;
    className?: string;
};

export default function ProductStatusLabels({ isNew, isHit, hasPromotion, isOutOfStock = false, className = "" }: Props) {
    const labels = resolveProductStatuses({ isNew, isHit, hasPromotion, isOutOfStock });

    if (labels.length === 0) {
        return null;
    }

    return (
        <div className={`absolute left-3 top-3 z-10 flex flex-col gap-1 ${className}`}>
            {labels.map((label) => {
                const isStockBadge = label.code === "out_of_stock";

                return (
                    <span
                        key={label.code}
                        className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] tracking-wide ${
                            isStockBadge ? "gap-1 font-medium" : "font-semibold"
                        } ${label.storefrontClassName}`}
                    >
                        {isStockBadge ? (
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 12 12"
                                fill="none"
                                aria-hidden
                                className="h-2.5 w-2.5 shrink-0 opacity-80"
                            >
                                <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.2" />
                                <path
                                    d="M6 3.6V6l1.7 1.1"
                                    stroke="currentColor"
                                    strokeWidth="1.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        ) : null}
                        {label.shortLabel}
                    </span>
                );
            })}
        </div>
    );
}
