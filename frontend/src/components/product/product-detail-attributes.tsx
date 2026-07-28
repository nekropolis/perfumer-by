import type { ProductDetailData } from "@/types/catalog";

type Props = {
    product: ProductDetailData;
};

export default function ProductDetailAttributes({ product }: Props) {
    if (product.attribute_values.length === 0) {
        return <div className="text-sm text-admin-text-secondary">Характеристики отсутствуют</div>;
    }

    return (
        <>
            <h2 id="product-specs-heading" className="sr-only">
                Характеристики
            </h2>
            <dl aria-labelledby="product-specs-heading">
                {product.attribute_values.map((item) => {
                    const label = item.attribute?.name || "Характеристика";

                    const valueText =
                        item.selected_options.length > 0
                            ? item.selected_options.map((option) => option.name).join(", ")
                            : item.custom_value || "—";

                    return (
                        <div
                            key={item.id}
                            className="grid grid-cols-1 gap-1 border-b border-admin-border py-2 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4 sm:py-2.5"
                        >
                            <dt className="text-sm font-semibold text-admin-text">{label}</dt>
                            <dd className="text-sm text-admin-text-secondary">{valueText}</dd>
                        </div>
                    );
                })}
            </dl>
        </>
    );
}
