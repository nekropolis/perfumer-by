"use client";

import { adminSelect } from "@/lib/admin-ui-classes";

type Option = {
    value: string;
    label: string;
};

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    label?: string;
    options: Option[];
    placeholder?: string;
    className?: string;
    /** Override select width classes. Default: `w-full md:w-56`. Use `w-auto` to fit option text. */
    selectClassName?: string;
};

export default function AdminFilterSelect({
    value,
    onChangeAction,
    label = "",
    options,
    placeholder = "Все",
    className = "",
    selectClassName,
}: Props) {
    return (
        <div className={className}>
            {label ? (
                <label className="mb-1.5 block text-sm font-medium text-admin-text-secondary">{label}</label>
            ) : null}
            <select
                value={value}
                onChange={(e) => onChangeAction(e.target.value)}
                className={`${adminSelect} ${selectClassName ?? "w-full md:w-56"}`}
            >
                <option value="">{placeholder}</option>
                {options.map((item) => (
                    <option key={item.value} value={item.value}>
                        {item.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
