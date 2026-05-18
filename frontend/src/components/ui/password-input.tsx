"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

type PasswordInputProps = {
    value: string;
    onChangeAction: (value: string) => void;
    className?: string;
    placeholder?: string;
    autoComplete?: string;
    id?: string;
};

export default function PasswordInput({
    value,
    onChangeAction,
    className = "",
    placeholder,
    autoComplete,
    id,
}: PasswordInputProps) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <input
                id={inputId}
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => onChangeAction(e.target.value)}
                placeholder={placeholder}
                autoComplete={autoComplete}
                className={`w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] py-3 pl-4 pr-11 text-[var(--foreground)] placeholder:text-[var(--text-secondary)] ${className}`.trim()}
            />
            <button
                type="button"
                onClick={() => setVisible((prev) => !prev)}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
                aria-pressed={visible}
            >
                {visible ? <EyeOff className="h-4 w-4" strokeWidth={2} aria-hidden /> : <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />}
            </button>
        </div>
    );
}
