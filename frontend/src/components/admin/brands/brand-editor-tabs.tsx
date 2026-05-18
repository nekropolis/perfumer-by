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
            className="mb-6 rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-2 shadow-sm"
            columnsClassName="grid grid-cols-2 gap-2"
            showDescription={false}
        />
    );
}
