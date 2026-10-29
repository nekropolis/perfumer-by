type Props = {
    description: string | null;
    /** Внутри таба: без верхней линии и лишних отступов. */
    embedded?: boolean;
};

export default function ProductDetailDescription({ description, embedded = false }: Props) {
    if (!description) {
        return null;
    }

    return (
        <section
            className={embedded ? undefined : "mt-8 border-t border-admin-border pt-8"}
            aria-labelledby="product-description-heading"
        >
            {/* Заголовок всегда в DOM для SEO; в табе визуально не дублируем подпись. */}
            <h2
                id="product-description-heading"
                className={embedded ? "sr-only" : "mt-3 mb-3 text-base font-semibold text-admin-text"}
            >
                Описание продукта
            </h2>
            <div
                className="ProseMirror prose prose-sm max-w-none text-admin-text sm:prose-base"
                dangerouslySetInnerHTML={{ __html: description }}
            />
        </section>
    );
}
