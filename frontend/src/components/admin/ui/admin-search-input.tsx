"use client";

import { Search } from "lucide-react";

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    label?: string;
    placeholder?: string;
    className?: string;
};

export default function AdminSearchInput({
                                             value,
                                             onChangeAction,
                                             placeholder = "Поиск...",
                                             className = "",
                                         }: Props) {
    return (
        <div className={className}>
            <div className="relative md:w-72">
                <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChangeAction(e.target.value)}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm transition outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                />
            </div>
        </div>
    );
}
