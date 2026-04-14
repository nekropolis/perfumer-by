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
            <label className="mb-1.5 block text-sm font-medium text-gray-600">{label}</label>
            <select
                value={value}
                onChange={(e) => onChangeAction(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 md:w-56"
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
