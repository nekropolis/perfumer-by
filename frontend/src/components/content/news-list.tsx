import Link from "next/link";
import { fetchCmsPosts } from "@/lib/cms-pages-api";

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
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Новости</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                    <article key={item.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                        {item.cover_image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.cover_image} alt={item.title} className="h-44 w-full object-cover" />
                        ) : null}
                        <div className="space-y-2 p-4">
                            <h3 className="line-clamp-2 text-base font-semibold text-gray-900">{item.title}</h3>
                            <p className="line-clamp-3 text-sm text-gray-600">{item.excerpt || "—"}</p>
                            <div className="flex items-center justify-between pt-1 text-sm">
                                <span className="text-gray-500">{formatDate(item.created_at)}</span>
                                <Link
                                    href={`/${encodeURIComponent(item.slug || String(item.id))}`}
                                    className="font-medium text-black hover:underline"
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
