import Breadcrumbs from "@/components/ui/breadcrumbs";
import type { CmsPublicPostDetail } from "@/lib/cms-pages-api";

type Props = {
    post: CmsPublicPostDetail;
};

export default function NewsPostDetailView({ post }: Props) {
    return (
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
            <Breadcrumbs
                className="mb-6"
                items={[
                    { label: "Главная", href: "/" },
                    { label: "Новости", href: "/news" },
                    { label: post.title },
                ]}
            />

            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="space-y-4 p-5 sm:p-6">
                    <h1 className="text-2xl font-semibold text-gray-900">{post.title}</h1>
                    <div className="text-sm text-gray-500">
                        {post.created_at ? new Date(post.created_at).toLocaleDateString("ru-RU") : "—"}
                    </div>
                    {post.cover_image ? (
                        <div className="float-none mb-4 w-full overflow-hidden rounded-xl border sm:float-left sm:mr-6 sm:mb-4 sm:w-[320px]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={post.cover_image} alt={post.title} className="h-full w-full object-cover" />
                        </div>
                    ) : null}
                    {post.excerpt ? <p className="text-gray-600">{post.excerpt}</p> : null}
                    {post.content ? (
                        <div
                            className="prose prose-sm max-w-none text-gray-800"
                            dangerouslySetInnerHTML={{ __html: post.content }}
                        />
                    ) : null}
                    {post.cover_image ? <div className="clear-both" /> : null}
                </div>
            </article>
        </main>
    );
}
