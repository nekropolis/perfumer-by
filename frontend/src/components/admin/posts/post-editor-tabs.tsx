"use client";

export type AdminPostEditorTab = "main" | "image" | "seo";

type Props = {
    activeTab: AdminPostEditorTab;
    onChangeAction: (tab: AdminPostEditorTab) => void;
};

export default function AdminPostEditorTabs({ activeTab, onChangeAction }: Props) {
    const tabs: Array<{ key: AdminPostEditorTab; label: string }> = [
        { key: "main", label: "Основное" },
        { key: "image", label: "Картинка" },
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
