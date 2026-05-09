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
    className = "mb-2 rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-2 shadow-sm",
    columnsClassName = "grid gap-2 md:grid-cols-3",
    showDescription = true,
}: Props<T>) {
    return (
        <div className={`${className} min-w-0 overflow-x-hidden`}>
            <div className={columnsClassName}>
                {items.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChangeAction(tab.id)}
                            className={`flex w-full min-w-0 items-center ${showDescription ? "gap-3 px-4 py-3 rounded-[18px]" : "gap-2 px-3 py-2 rounded-xl border"} text-left transition-all duration-200 ${
                                isActive
                                    ? `${showDescription ? "" : "border-slate-900/25"} bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)]`
                                    : `${showDescription ? "" : "border-slate-200"} bg-transparent text-slate-700 hover:bg-white hover:shadow-sm`
                            }`}
                        >
                            <span
                                className={`flex ${showDescription ? "h-10 w-10 rounded-2xl" : "h-8 w-8 rounded-xl"} shrink-0 items-center justify-center border ${
                                    isActive
                                        ? "border-white/10 bg-white/10 text-white"
                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                }`}
                            >
                                <Icon size={showDescription ? 18 : 16} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={`block truncate text-sm ${isActive ? "font-semibold" : "font-semibold text-slate-900"}`}>
                                    {tab.label}
                                </span>
                                {showDescription ? (
                                    <span className={`mt-0.5 block truncate text-xs ${isActive ? "text-slate-300" : "text-slate-500"}`}>
                                        {tab.description}
                                    </span>
                                ) : null}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
