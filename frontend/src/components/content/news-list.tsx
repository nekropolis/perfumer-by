import Link from "next/link";
import { fetchCmsPosts } from "@/lib/cms-pages-api";
import { siteCard } from "@/lib/site-ui-classes";

function formatDate(value?: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU");
}

export default async function NewsList({ limit = 6 }: { limit?: number }) {
    const items = await fetchCmsPosts({ type: "news", limit });

    return (
        <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                    <article
                        key={item.id}
                        className={`${siteCard} flex h-full flex-col overflow-hidden transition hover:border-admin-border-strong hover:shadow-md`}
                    >
                        {item.cover_image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.cover_image} alt={item.title} className="h-44 w-full shrink-0 object-cover" />
                        ) : null}
                        <div className="flex flex-1 flex-col gap-2 p-4">
                            <h2 className="line-clamp-2 text-base font-semibold text-admin-text">{item.title}</h2>
                            <p className="line-clamp-3 text-sm text-admin-text-secondary">{item.excerpt || "—"}</p>
                            <div className="mt-auto flex items-center justify-between pt-2 text-sm">
                                <span className="text-admin-text-secondary">{formatDate(item.created_at)}</span>
                                <Link
                                    href={`/${encodeURIComponent(item.slug || String(item.id))}`}
                                    className="font-medium text-admin-primary hover:underline"
                                >
                                    Перейти
                                </Link>
                            </div>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
