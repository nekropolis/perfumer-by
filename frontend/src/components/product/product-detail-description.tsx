type Props = {
    description: string | null;
};

export default function ProductDetailDescription({ description }: Props) {
    if (!description) {
        return null;
    }

    return (
        <section className="mt-8 border-t border-admin-border pt-8" aria-labelledby="product-description-heading">
            <h2 id="product-description-heading" className="mt-3 mb-3 text-base font-semibold text-admin-text">
                Описание продукта
            </h2>
            <div
                className="ProseMirror prose prose-sm max-w-none text-admin-text sm:prose-base"
                dangerouslySetInnerHTML={{ __html: description }}
            />
        </section>
    );
}
