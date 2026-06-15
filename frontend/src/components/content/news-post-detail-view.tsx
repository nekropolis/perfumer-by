import Breadcrumbs from "@/components/ui/breadcrumbs";
import type { CmsPublicPostDetail } from "@/lib/cms-pages-api";
import { siteCard } from "@/lib/site-ui-classes";

type Props = {
    post: CmsPublicPostDetail;
};

export default function NewsPostDetailView({ post }: Props) {
    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <Breadcrumbs
                    className="mb-6"
                    items={[
                        { label: "Главная", href: "/" },
                        { label: "Новости", href: "/news" },
                        { label: post.title },
                    ]}
                />

                <article className={`${siteCard} overflow-hidden`}>
                    <div className="space-y-4 p-5 sm:p-6">
                        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{post.title}</h1>
                        <div className="text-sm text-admin-text-secondary">
                            {post.created_at ? new Date(post.created_at).toLocaleDateString("ru-RU") : "—"}
                        </div>
                        {post.cover_image ? (
                            <div className="float-none mb-4 w-full overflow-hidden rounded-lg border border-admin-border sm:float-left sm:mr-6 sm:mb-4 sm:w-[320px]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={post.cover_image} alt={post.title} className="h-full w-full object-cover" />
                            </div>
                        ) : null}
                        {post.excerpt ? <p className="text-admin-text-secondary">{post.excerpt}</p> : null}
                        {post.content ? (
                            <div
                                className="prose prose-sm max-w-none text-admin-text sm:prose-base"
                                dangerouslySetInnerHTML={{ __html: post.content }}
                            />
                        ) : null}
                        {post.cover_image ? <div className="clear-both" /> : null}
                    </div>
                </article>
            </div>
        </main>
    );
}
