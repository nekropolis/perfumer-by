"use client";

import { useRef } from "react";

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    className?: string;
    plainDigitsMode?: boolean;
};

const COUNTRY_PREFIX = "375";
const MASK_TEMPLATE = "+375(__) ___-__-__";
const ALLOWED_OPERATOR_CODES = ["25", "29", "33", "44"];

const DIGIT_POSITIONS = [5, 6, 9, 10, 11, 13, 14, 16, 17];

function extractLocalDigits(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith(COUNTRY_PREFIX)) {
        return digits.slice(COUNTRY_PREFIX.length).slice(0, 9);
    }
    return digits.slice(0, 9);
}

function formatMasked(localDigits: string): string {
    const chars = MASK_TEMPLATE.split("");

    for (let i = 0; i < DIGIT_POSITIONS.length; i++) {
        chars[DIGIT_POSITIONS[i]] = localDigits[i] ?? "_";
    }

    return chars.join("");
}

function getDigitIndexFromCursor(cursorPos: number): number {
    for (let i = 0; i < DIGIT_POSITIONS.length; i++) {
        if (cursorPos <= DIGIT_POSITIONS[i]) {
            return i;
        }
    }
    return DIGIT_POSITIONS.length;
}

function getCursorFromDigitIndex(digitIndex: number): number {
    if (digitIndex <= 0) return DIGIT_POSITIONS[0];
    if (digitIndex >= DIGIT_POSITIONS.length) {
        return DIGIT_POSITIONS[DIGIT_POSITIONS.length - 1] + 1;
    }
    return DIGIT_POSITIONS[digitIndex];
}

function normalizeLocalDigits(digits: string): string {
    const normalized = digits.replace(/\D/g, "").slice(0, 9);

    if (normalized.length >= 2) {
        const operatorCode = normalized.slice(0, 2);

        if (!ALLOWED_OPERATOR_CODES.includes(operatorCode)) {
            return normalized.slice(0, 1);
        }
    }

    return normalized;
}

export function isBelarusPhoneComplete(value: string): boolean {
    const digits = value.replace(/\D/g, "");
    return /^375(25|29|33|44)\d{7}$/.test(digits);
}

export function isPhoneDigitsComplete(value: string): boolean {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 5;
}

export default function PhoneInput({
    value,
    onChangeAction,
    className = "",
    plainDigitsMode = false,
}: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    if (plainDigitsMode) {
        const digits = value.replace(/\D/g, "").slice(0, 32);
        return (
            <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={digits}
                placeholder="Введите номер цифрами"
                onChange={(e) => onChangeAction(e.target.value.replace(/\D/g, "").slice(0, 32))}
                className={`w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--text-secondary)] ${className}`}
            />
        );
    }

    const localDigits = extractLocalDigits(value);
    const displayValue = formatMasked(localDigits);

    const commitDigits = (digits: string, nextDigitIndex?: number) => {
        const normalizedLocal = normalizeLocalDigits(digits);
        onChangeAction(COUNTRY_PREFIX + normalizedLocal);

        requestAnimationFrame(() => {
            const input = inputRef.current;
            if (!input) return;

            const index =
                typeof nextDigitIndex === "number"
                    ? Math.min(nextDigitIndex, normalizedLocal.length)
                    : normalizedLocal.length;

            const pos = getCursorFromDigitIndex(index);
            input.setSelectionRange(pos, pos);
        });
    };

    const handleFocus = () => {
        const input = inputRef.current;
        if (!input) return;

        requestAnimationFrame(() => {
            const filledDigits = localDigits.length;
            const pos = getCursorFromDigitIndex(filledDigits);
            input.setSelectionRange(pos, pos);
        });
    };

    const handleClick = () => {
        const input = inputRef.current;
        if (!input) return;

        const start = input.selectionStart ?? 0;
        const digitIndex = getDigitIndexFromCursor(start);
        const pos = getCursorFromDigitIndex(digitIndex);

        requestAnimationFrame(() => {
            input.setSelectionRange(pos, pos);
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const input = inputRef.current;
        if (!input) return;

        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;

        const startDigitIndex = getDigitIndexFromCursor(start);
        const endDigitIndex = getDigitIndexFromCursor(end);

        const hasSelection = start !== end;

        if (e.key === "ArrowLeft") {
            e.preventDefault();
            const nextIndex = Math.max(0, startDigitIndex - 1);
            const pos = getCursorFromDigitIndex(nextIndex);
            input.setSelectionRange(pos, pos);
            return;
        }

        if (e.key === "ArrowRight") {
            e.preventDefault();
            const nextIndex = Math.min(9, startDigitIndex + 1);
            const pos = getCursorFromDigitIndex(nextIndex);
            input.setSelectionRange(pos, pos);
            return;
        }

        if (e.key === "Home") {
            e.preventDefault();
            const pos = getCursorFromDigitIndex(0);
            input.setSelectionRange(pos, pos);
            return;
        }

        if (e.key === "End") {
            e.preventDefault();
            const pos = getCursorFromDigitIndex(localDigits.length);
            input.setSelectionRange(pos, pos);
            return;
        }

        if (e.key === "Backspace") {
            e.preventDefault();

            if (hasSelection) {
                const arr = localDigits.split("");
                arr.splice(startDigitIndex, endDigitIndex - startDigitIndex);
                commitDigits(arr.join(""), startDigitIndex);
                return;
            }

            if (startDigitIndex <= 0) {
                commitDigits(localDigits, 0);
                return;
            }

            const removeIndex = startDigitIndex - 1;
            const arr = localDigits.split("");
            arr.splice(removeIndex, 1);
            commitDigits(arr.join(""), removeIndex);
            return;
        }

        if (e.key === "Delete") {
            e.preventDefault();

            if (hasSelection) {
                const arr = localDigits.split("");
                arr.splice(startDigitIndex, endDigitIndex - startDigitIndex);
                commitDigits(arr.join(""), startDigitIndex);
                return;
            }

            const arr = localDigits.split("");
            arr.splice(startDigitIndex, 1);
            commitDigits(arr.join(""), startDigitIndex);
            return;
        }

        if (/^\d$/.test(e.key)) {
            e.preventDefault();

            const arr = localDigits.split("");

            if (hasSelection) {
                arr.splice(startDigitIndex, endDigitIndex - startDigitIndex, e.key);
                commitDigits(arr.join(""), startDigitIndex + 1);
                return;
            }

            if (arr.length >= 9 && startDigitIndex >= 9) {
                return;
            }

            arr.splice(startDigitIndex, 0, e.key);
            commitDigits(arr.join(""), startDigitIndex + 1);
            return;
        }

        if (e.key === "Tab" || e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }

        e.preventDefault();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();

        const pasted = e.clipboardData.getData("text");
        const digits = pasted.replace(/\D/g, "");
        const local = digits.startsWith(COUNTRY_PREFIX)
            ? digits.slice(COUNTRY_PREFIX.length)
            : digits;

        commitDigits(local, Math.min(local.length, 9));
    };

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={displayValue}
            placeholder="+375(29) 777-77-77"
            onChange={() => {}}
            onFocus={handleFocus}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className={`w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--text-secondary)] ${className}`}
        />
    );
}