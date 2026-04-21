import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import CmsPageView from "@/components/cms/cms-page-view";
import { fetchCmsPageBySlug } from "@/lib/cms-pages-api";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const page = await fetchCmsPageBySlug(slug);

    if (!page) {
        return {};
    }

    const title = page.seo_title || page.h1 || page.name;
    const description = page.seo_description || "";

    return {
        title,
        description,
    };
}

export default async function CmsSlugPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    if (slug === "home" || slug === "glavnaya") {
        redirect("/");
    }
    const page = await fetchCmsPageBySlug(slug);

    if (!page) {
        notFound();
    }

    return <CmsPageView page={page} />;
}
