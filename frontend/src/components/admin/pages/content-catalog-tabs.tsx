"use client";

import { LayoutTemplate, ListFilter, Newspaper, PanelsTopLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";

type ContentCatalogTab = "pages" | "blocks" | "posts" | "landings";

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
        id: "landings",
        label: "Посадочные каталога",
        description: "SEO /catalog/{slug} с фильтрами",
        icon: ListFilter,
    },
];

export default function ContentCatalogTabs() {
    const router = useRouter();
    const pathname = usePathname();

    const activeTab: ContentCatalogTab = pathname.startsWith("/admin/blocks")
        ? "blocks"
        : pathname.startsWith("/admin/posts")
            ? "posts"
            : pathname.startsWith("/admin/catalog-landings")
                ? "landings"
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
                if (tab === "landings") {
                    router.push("/admin/catalog-landings");
                    return;
                }
                router.push("/admin/pages");
            }}
        />
    );
}
