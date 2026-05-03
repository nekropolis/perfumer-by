import type { ReviewItem } from "@/types/reviews";
import { formatReviewDateRu, normalizeReviewItem } from "@/lib/review-text-display";

/** Серверный HTML отзывов для view-source / краулеров (вне client boundary). */
export default function ProductReviewsSeoHtml({ reviews }: { reviews: ReviewItem[] }) {
    const count = reviews.length;
    const items = count > 0 ? reviews.map(normalizeReviewItem) : [];

    return (
        <section
            data-seo="product-reviews"
            data-review-count={String(count)}
            className={count > 0 ? "sr-only" : "hidden"}
            aria-hidden={count > 0 ? true : undefined}
        >
            {count === 0 ? null : (
                <>
                    <h2>Отзывы о товаре</h2>
                    <ul>
                        {items.map((item) => (
                            <li key={item.id}>
                                <div>{item.name}</div>
                                {item.created_at ? <div>{formatReviewDateRu(item.created_at)}</div> : null}
                                <div>Оценка: {item.stars} из 5</div>
                                <p className="whitespace-pre-wrap">{item.text}</p>
                                {item.reply?.text ? (
                                    <div>
                                        <div>Ответ магазина</div>
                                        {item.reply.replied_at ? (
                                            <div>{formatReviewDateRu(item.reply.replied_at)}</div>
                                        ) : null}
                                        <p className="whitespace-pre-wrap">{item.reply.text}</p>
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}
