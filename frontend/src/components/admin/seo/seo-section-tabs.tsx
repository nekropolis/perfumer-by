"use client";

import { FileText, Link2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";

type SeoSectionTab = "productDescriptions" | "redirects" | "legacyProducts";

const SEO_SECTION_TABS: AdminRichTabItem<SeoSectionTab>[] = [
    {
        id: "productDescriptions",
        label: "Описание продуктов",
        description: "Очередь генерации SEO-описаний",
        icon: FileText,
    },
    {
        id: "redirects",
        label: "Редиректы",
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

export default function SeoSectionTabs() {
    const router = useRouter();
    const pathname = usePathname();

    const activeTab: SeoSectionTab = pathname.startsWith("/admin/seo-redirects")
        ? "redirects"
        : pathname.startsWith("/admin/legacy-products")
            ? "legacyProducts"
            : "productDescriptions";

    return (
        <AdminRichTabs
            items={SEO_SECTION_TABS}
            activeTab={activeTab}
            onChangeAction={(tab) => {
                if (tab === "redirects") {
                    router.push("/admin/seo-redirects");
                    return;
                }
                if (tab === "legacyProducts") {
                    router.push("/admin/legacy-products");
                    return;
                }
                router.push("/admin/seo/product-descriptions");
            }}
        />
    );
}
