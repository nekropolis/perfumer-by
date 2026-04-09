"use client";

type Option = {
    value: string;
    label: string;
};

type Props = {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    options: Option[];
    placeholder?: string;
    className?: string;
};

export default function AdminFilterSelect({
                                              value,
                                              onChange,
                                              label = "Фильтр",
                                              options,
                                              placeholder = "Все",
                                              className = "",
                                          }: Props) {
    return (
        <div className={className}>
            <label className="mb-1 block text-sm text-gray-500">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-xl border px-4 py-2 text-sm focus:outline-none md:w-52"
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