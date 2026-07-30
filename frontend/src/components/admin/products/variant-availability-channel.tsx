/** Канал наличия варианта: склад / офер / оба. */
export type VariantAvailabilityChannel = {
    label: "Склад" | "Офер" | "Ск/Оф";
    title: string;
    className: string;
};

export function resolveVariantAvailabilityChannel(
    hasWarehouse: boolean,
    hasOffer: boolean,
): VariantAvailabilityChannel | null {
    if (hasWarehouse && hasOffer) {
        return {
            label: "Ск/Оф",
            title: "Есть остаток на складе и активный офер поставщика",
            className: "bg-violet-50 text-violet-800",
        };
    }

    if (hasWarehouse) {
        return {
            label: "Склад",
            title: "Есть доступный остаток на основном складе",
            className: "bg-emerald-50 text-emerald-800",
        };
    }

    if (hasOffer) {
        return {
            label: "Офер",
            title: "Есть активный офер / канал поставщика",
            className: "bg-blue-50 text-blue-800",
        };
    }

    return null;
}

export function VariantAvailabilityChannelBadge({
    hasWarehouse,
    hasOffer,
}: {
    hasWarehouse: boolean;
    hasOffer: boolean;
}) {
    const channel = resolveVariantAvailabilityChannel(hasWarehouse, hasOffer);

    if (!channel) {
        return <span className="text-xs text-admin-text-secondary">—</span>;
    }

    return (
        <span
            className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${channel.className}`}
            title={channel.title}
        >
            {channel.label}
        </span>
    );
}
