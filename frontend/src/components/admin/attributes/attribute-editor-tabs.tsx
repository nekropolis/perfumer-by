"use client";

import { FileText, ListChecks } from "lucide-react";
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";

export type AttributeEditorTab = "main" | "options";

type Props = {
    activeTab: AttributeEditorTab;
    onChangeAction: (tab: AttributeEditorTab) => void;
};

const tabs: AdminRichTabItem<AttributeEditorTab>[] = [
    { id: "main", label: "Главная", description: "Базовые настройки атрибута", icon: FileText },
    { id: "options", label: "Опции", description: "Управление значениями списка", icon: ListChecks },
];

export default function AttributeEditorTabs({ activeTab, onChangeAction }: Props) {
    return (
        <AdminRichTabs
            items={tabs}
            activeTab={activeTab}
            onChangeAction={onChangeAction}
        />
    );
}
