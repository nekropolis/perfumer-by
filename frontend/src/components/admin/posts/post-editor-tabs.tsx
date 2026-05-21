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
        <div className="mb-5 border-b border-admin-border">
            <div className="flex min-w-0 overflow-x-auto">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onChangeAction(tab.key)}
                        className={`relative shrink-0 px-4 py-3 text-center text-sm font-medium transition-colors ${
                            isActive
                                ? "text-admin-primary"
                                : "text-admin-text-secondary hover:text-admin-text"
                        }`}
                    >
                        {tab.label}
                        <span
                            className={`absolute inset-x-4 bottom-0 h-[3px] rounded-t-full transition-all ${
                                isActive ? "bg-admin-primary opacity-100" : "bg-transparent opacity-0"
                            }`}
                        />
                    </button>
                );
            })}
            </div>
        </div>
    );
}
