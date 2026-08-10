"use client";

import Link from "next/link";
import { LEGAL_PAGE_PATHS } from "@/lib/legal-links";
import LegalHelpIcon from "@/components/legal/legal-help-icon";

type Props = {
    checked: boolean;
    onChange: (checked: boolean) => void;
    id?: string;
    className?: string;
    /** Показать ошибку, если не отмечено */
    invalid?: boolean;
};

/** Обязательное согласие на обработку ПДн (формы лидов и checkout). По умолчанию не отмечено. */
export default function PrivacyConsentCheckbox({
    checked,
    onChange,
    id = "accept-privacy",
    className = "",
    invalid = false,
}: Props) {
    return (
        <label
            htmlFor={id}
            className={`flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-admin-text ${className}`}
        >
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className={`mt-0.5 h-4 w-4 shrink-0 rounded border-admin-border accent-admin-primary ${
                    invalid ? "outline outline-2 outline-offset-1 outline-red-500" : ""
                }`}
            />
            <span>
                Я согласен(а) на обработку персональных данных в соответствии с{" "}
                <Link
                    href={LEGAL_PAGE_PATHS.privacy}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-admin-primary underline-offset-2 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                >
                    политикой
                </Link>
                <LegalHelpIcon href={LEGAL_PAGE_PATHS.privacy} label="Открыть политику обработки персональных данных" />
                .
                {invalid ? (
                    <span className="mt-1 block text-xs text-red-600">Отметьте согласие, чтобы продолжить.</span>
                ) : null}
            </span>
        </label>
    );
}
