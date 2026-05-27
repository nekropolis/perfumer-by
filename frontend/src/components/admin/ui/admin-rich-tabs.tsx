"use client";

import type { LucideIcon } from "lucide-react";

export type AdminRichTabItem<T extends string> = {
    id: T;
    label: string;
    description: string;
    icon: LucideIcon;
};

type Props<T extends string> = {
    items: AdminRichTabItem<T>[];
    activeTab: T;
    onChangeAction: (tab: T) => void;
    className?: string;
    columnsClassName?: string;
    showDescription?: boolean;
};

export default function AdminRichTabs<T extends string>({
    items,
    activeTab,
    onChangeAction,
    className = "mb-5 border-b border-admin-border",
    columnsClassName = "flex max-w-full overflow-x-auto",
}: Props<T>) {
    return (
        <div className={className}>
            <div className={columnsClassName}>
                {items.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChangeAction(tab.id)}
                            className={`group relative flex shrink-0 items-center gap-2.5 px-4 py-3 text-left transition-colors ${
                                isActive
                                    ? "text-admin-primary"
                                    : "text-admin-text-secondary hover:text-admin-text"
                            }`}
                        >
                            <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                                    isActive
                                        ? "bg-admin-primary-soft text-admin-primary"
                                        : "bg-transparent text-admin-text-muted group-hover:bg-admin-muted group-hover:text-admin-text"
                                }`}
                            >
                                <Icon size={15} />
                            </span>
                            <span
                                className={`whitespace-nowrap text-sm ${isActive ? "font-semibold" : "font-medium"}`}
                            >
                                {tab.label}
                            </span>
                            <span
                                className={`absolute inset-x-4 bottom-0 h-[3px] rounded-t-full transition-all ${
                                    isActive
                                        ? "bg-admin-primary opacity-100"
                                        : "bg-transparent opacity-0 group-hover:bg-admin-accent group-hover:opacity-100"
                                }`}
                            />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
