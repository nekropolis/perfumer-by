"use client";

import { FileText, Search } from "lucide-react";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";

export type BrandEditorTab = "main" | "seo";

type Props = {
    activeTab: BrandEditorTab;
    onChangeAction: (tab: BrandEditorTab) => void;
};

const tabs: AdminRichTabItem<BrandEditorTab>[] = [
    { id: "main", label: "Главная", description: "", icon: FileText },
    { id: "seo", label: "SEO", description: "", icon: Search },
];

export default function BrandEditorTabs({ activeTab, onChangeAction }: Props) {
    return (
        <AdminRichTabs
            items={tabs}
            activeTab={activeTab}
            onChangeAction={onChangeAction}
            showDescription={false}
        />
    );
}
