"use client";

import { LayoutTemplate, PanelsTopLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";

type ContentCatalogTab = "pages" | "blocks";

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
];

export default function ContentCatalogTabs() {
    const router = useRouter();
    const pathname = usePathname();

    const activeTab: ContentCatalogTab = pathname.startsWith("/admin/blocks")
        ? "blocks"
        : "pages";

    return (
        <AdminRichTabs
            items={CONTENT_CATALOG_TABS}
            activeTab={activeTab}
            onChangeAction={(tab) => {
                router.push(tab === "blocks" ? "/admin/blocks" : "/admin/pages");
            }}
            columnsClassName="grid gap-2 md:grid-cols-2"
        />
    );
}
