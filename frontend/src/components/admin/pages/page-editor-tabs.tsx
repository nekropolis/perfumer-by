"use client";

export type AdminPageEditorTab = "main" | "seo";

type Props = {
    activeTab: AdminPageEditorTab;
    onChangeAction: (tab: AdminPageEditorTab) => void;
};

export default function AdminPageEditorTabs({ activeTab, onChangeAction }: Props) {
    const tabs: Array<{ key: AdminPageEditorTab; label: string }> = [
        { key: "main", label: "Основное" },
        { key: "seo", label: "SEO" },
    ];

    return (
        <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onChangeAction(tab.key)}
                        className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                            isActive
                                ? "border-black bg-black text-white"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
