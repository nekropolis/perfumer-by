"use client";

export type ProductEditorTab =
    | "main"
    | "images"
    | "variants"
    | "attributes"
    | "seo";

type Props = {
    activeTab: ProductEditorTab;
    onChange: (tab: ProductEditorTab) => void;
};

const tabs: { key: ProductEditorTab; label: string }[] = [
    { key: "main", label: "Главная" },
    { key: "images", label: "Картинки" },
    { key: "variants", label: "Варианты" },
    { key: "attributes", label: "Атрибуты" },
    { key: "seo", label: "SEO" },
];

export default function ProductEditorTabs({ activeTab, onChange }: Props) {
    return (
        <div className="mb-6 overflow-x-auto">
            <div className="flex min-w-max gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onChange(tab.key)}
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
