"use client";

import { FileText, ImageIcon, Layers, Search, SlidersHorizontal } from "lucide-react";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";

export type ProductEditorTab =
    | "main"
    | "images"
    | "variants"
    | "attributes"
    | "seo";

type Props = {
    activeTab: ProductEditorTab;
    onChangeAction: (tab: ProductEditorTab) => void;
};

const tabs: AdminRichTabItem<ProductEditorTab>[] = [
    { id: "main", label: "Главная", description: "", icon: FileText },
    { id: "images", label: "Картинки", description: "", icon: ImageIcon },
    { id: "variants", label: "Варианты", description: "", icon: Layers },
    { id: "attributes", label: "Атрибуты", description: "", icon: SlidersHorizontal },
    { id: "seo", label: "SEO", description: "", icon: Search },
];

export default function ProductEditorTabs({ activeTab, onChangeAction }: Props) {
    return (
        <AdminRichTabs
            items={tabs}
            activeTab={activeTab}
            onChangeAction={onChangeAction}
            showDescription={false}
        />
    );
}
