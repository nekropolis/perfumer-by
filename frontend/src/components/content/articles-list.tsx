import { fetchCmsPosts } from "@/lib/cms-pages-api";
import CmsPostCard from "@/components/content/cms-post-card";

function formatDate(value?: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU");
}

export default async function ArticlesList({ limit = 6 }: { limit?: number }) {
    const items = await fetchCmsPosts({ type: "article", limit });

    return (
        <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                    <CmsPostCard
                        key={item.id}
                        href={`/${encodeURIComponent(item.slug || String(item.id))}`}
                        title={item.title}
                        excerpt={item.excerpt}
                        coverImage={item.cover_image}
                        dateLabel={formatDate(item.created_at)}
                    />
                ))}
            </div>
        </section>
    );
}
