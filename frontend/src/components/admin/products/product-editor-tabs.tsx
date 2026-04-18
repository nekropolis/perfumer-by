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
            className="mb-6 rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-2 shadow-sm"
            columnsClassName="grid grid-cols-5 gap-2"
            showDescription={false}
        />
    );
}
