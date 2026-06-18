import { resolveProductStatuses } from "@/lib/product-statuses";

type Props = {
    isNew: boolean;
    isHit: boolean;
    hasDiscount: boolean;
    className?: string;
};

export default function ProductStatusLabels({ isNew, isHit, hasDiscount, className = "" }: Props) {
    const labels = resolveProductStatuses({ isNew, isHit, hasDiscount });

    if (labels.length === 0) {
        return null;
    }

    return (
        <div className={`absolute left-3 top-3 z-10 flex flex-col gap-1 ${className}`}>
            {labels.map((label) => (
                <span
                    key={label.code}
                    className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${label.storefrontClassName}`}
                >
                    {label.shortLabel}
                </span>
            ))}
        </div>
    );
}
