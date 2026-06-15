import type { CmsPublicPage } from "@/lib/cms-pages-api";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { siteCard } from "@/lib/site-ui-classes";

type Props = {
    page: CmsPublicPage;
};

export default function CmsPageView({ page }: Props) {
    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-5xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
                <Breadcrumbs
                    className="mb-4"
                    items={[
                        { label: "Главная", href: "/" },
                        { label: page.h1 || page.name },
                    ]}
                />
                <article className={`${siteCard} p-6 sm:p-8 lg:p-10`}>
                    <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                        {page.h1 || page.name}
                    </h1>

                    {page.content ? (
                        <div
                            className="ProseMirror prose prose-sm mt-6 max-w-none text-admin-text sm:prose-base"
                            dangerouslySetInnerHTML={{ __html: page.content }}
                        />
                    ) : (
                        <p className="mt-4 text-sm text-admin-text-secondary">Контент страницы пока не заполнен.</p>
                    )}
                </article>
            </div>
        </main>
    );
}
