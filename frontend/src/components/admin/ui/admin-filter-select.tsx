"use client";

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
};

export default function AdminFilterSelect({
                                              value,
                                              onChangeAction,
                                              label = "",
                                              options,
                                              placeholder = "Все",
                                              className = "",
                                          }: Props) {
    return (
        <div className={className}>
            <label className="mb-1.5 block text-sm font-medium text-admin-text-secondary">{label}</label>
            <select
                value={value}
                onChange={(e) => onChangeAction(e.target.value)}
                className="w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text transition outline-none focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/20 md:w-56"
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
