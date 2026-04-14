"use client";

export type AttributeEditorTab = "main" | "options";

type Props = {
    activeTab: AttributeEditorTab;
    onChangeAction: (tab: AttributeEditorTab) => void;
};

const tabs: { key: AttributeEditorTab; label: string }[] = [
    { key: "main", label: "Главная" },
    { key: "options", label: "Опции" },
];

export default function AttributeEditorTabs({ activeTab, onChangeAction }: Props) {
    return (
        <div className="mb-6 overflow-x-auto">
            <div className="flex min-w-max gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onChangeAction(tab.key)}
                        className={`rounded-xl px-4 py-2 text-sm transition ${
                            activeTab === tab.key
                                ? "bg-black text-white"
                                : "border bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
