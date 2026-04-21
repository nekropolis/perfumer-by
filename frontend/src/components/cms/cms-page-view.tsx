import type { CmsPublicPage } from "@/lib/cms-pages-api";

type Props = {
    page: CmsPublicPage;
};

export default function CmsPageView({ page }: Props) {
    return (
        <main className="mx-auto max-w-5xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
            <article className="rounded-3xl border bg-white p-6 shadow-sm sm:p-8 lg:p-10">
                <h1 className="text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl">
                    {page.h1 || page.name}
                </h1>

                {page.content ? (
                    <div
                        className="ProseMirror prose prose-sm mt-6 max-w-none sm:prose-base"
                        dangerouslySetInnerHTML={{ __html: page.content }}
                    />
                ) : (
                    <p className="mt-4 text-sm text-gray-500">Контент страницы пока не заполнен.</p>
                )}
            </article>
        </main>
    );
}
