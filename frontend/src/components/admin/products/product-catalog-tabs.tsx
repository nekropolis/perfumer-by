"use client";

import { Boxes, Package } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";

type ProductCatalogTab = "products" | "variants";

const PRODUCT_CATALOG_TABS: AdminRichTabItem<ProductCatalogTab>[] = [
    {
        id: "products",
        label: "Продукт",
        description: "Список и управление продуктами",
        icon: Package,
    },
    {
        id: "variants",
        label: "Варианты продукта",
        description: "Справочник формулировок вариантов",
        icon: Boxes,
    },
];

export default function ProductCatalogTabs() {
    const router = useRouter();
    const pathname = usePathname();

    const activeTab: ProductCatalogTab = pathname.startsWith("/admin/products/variants")
        ? "variants"
        : "products";

    return (
        <AdminRichTabs
            items={PRODUCT_CATALOG_TABS}
            activeTab={activeTab}
            onChangeAction={(tab) => {
                router.push(tab === "variants" ? "/admin/products/variants" : "/admin/products");
            }}
            columnsClassName="grid gap-2 md:grid-cols-2"
        />
    );
}

