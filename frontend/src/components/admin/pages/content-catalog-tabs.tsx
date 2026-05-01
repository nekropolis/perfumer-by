"use client";

import { LayoutTemplate, Link2, Newspaper, PanelsTopLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";

type ContentCatalogTab = "pages" | "blocks" | "posts" | "redirects" | "legacyProducts";

const CONTENT_CATALOG_TABS: AdminRichTabItem<ContentCatalogTab>[] = [
    {
        id: "pages",
        label: "Страницы",
        description: "Страницы с отдельным URL",
        icon: PanelsTopLeft,
    },
    {
        id: "blocks",
        label: "Блоки на странице",
        description: "Встраиваемые блоки без URL",
        icon: LayoutTemplate,
    },
    {
        id: "posts",
        label: "Новости/Статьи",
        description: "Публикации для контентных разделов",
        icon: Newspaper,
    },
    {
        id: "redirects",
        label: "SEO редиректы",
        description: "301/302/410 правила перенаправления",
        icon: Link2,
    },
    {
        id: "legacyProducts",
        label: "Legacy products",
        description: "Ручная привязка unmatched товаров",
        icon: Link2,
    },
];

export default function ContentCatalogTabs() {
    const router = useRouter();
    const pathname = usePathname();

    const activeTab: ContentCatalogTab = pathname.startsWith("/admin/blocks")
        ? "blocks"
        : pathname.startsWith("/admin/posts")
            ? "posts"
            : pathname.startsWith("/admin/seo-redirects")
                ? "redirects"
                : pathname.startsWith("/admin/legacy-products")
                    ? "legacyProducts"
            : "pages";

    return (
        <AdminRichTabs
            items={CONTENT_CATALOG_TABS}
            activeTab={activeTab}
            onChangeAction={(tab) => {
                if (tab === "blocks") {
                    router.push("/admin/blocks");
                    return;
                }
                if (tab === "posts") {
                    router.push("/admin/posts");
                    return;
                }
                if (tab === "redirects") {
                    router.push("/admin/seo-redirects");
                    return;
                }
                if (tab === "legacyProducts") {
                    router.push("/admin/legacy-products");
                    return;
                }
                router.push("/admin/pages");
            }}
            columnsClassName="grid gap-2 md:grid-cols-5"
        />
    );
}
