"use client";

type Props = {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
    className?: string;
};

export default function AdminSearchInput({
                                             value,
                                             onChange,
                                             label = "Поиск",
                                             placeholder = "Поиск...",
                                             className = "",
                                         }: Props) {
    return (
        <div className={className}>
            <label className="mb-1 block text-sm text-gray-500">{label}</label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border px-4 py-2 text-sm focus:outline-none md:w-64"
            />
        </div>
    );
}