"use client";

import { useRef } from "react";

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    className?: string;
    plainDigitsMode?: boolean;
    /** Подсказка под полем (текст общий для чекаута, логина и модалок). По умолчанию включена. */
    showHint?: boolean;
};

const PHONE_INPUT_HINT_PLAIN = "Номер с кодом страны, только цифры (8–15).";
const PHONE_INPUT_HINT_MOBILE = "Мобильный (25/29/33/44) и номер.";

const COUNTRY_PREFIX = "375";
const PLAIN_PHONE_MIN_DIGITS = 8;
const PLAIN_PHONE_MAX_DIGITS = 15;
/** Маска только для части после +375 (в инпуте без кода страны). */
const MASK_LOCAL = `(__) ___-__-__`;
const ALLOWED_OPERATOR_CODES = ["25", "29", "33", "44"];

const MASK_LOCAL_DIGIT_POSITIONS = [1, 2, 5, 6, 7, 9, 10, 12, 13];

function extractLocalDigits(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith(COUNTRY_PREFIX)) {
        return digits.slice(COUNTRY_PREFIX.length).slice(0, 9);
    }
    return digits.slice(0, 9);
}

function formatMasked(localDigits: string): string {
    const chars = MASK_LOCAL.split("");

    for (let i = 0; i < MASK_LOCAL_DIGIT_POSITIONS.length; i++) {
        chars[MASK_LOCAL_DIGIT_POSITIONS[i]] = localDigits[i] ?? "_";
    }

    return chars.join("");
}

function getDigitIndexFromCursor(cursorPos: number): number {
    for (let i = 0; i < MASK_LOCAL_DIGIT_POSITIONS.length; i++) {
        if (cursorPos <= MASK_LOCAL_DIGIT_POSITIONS[i]) {
            return i;
        }
    }
    return MASK_LOCAL_DIGIT_POSITIONS.length;
}

function getCursorFromDigitIndex(digitIndex: number): number {
    if (digitIndex <= 0) return MASK_LOCAL_DIGIT_POSITIONS[0];
    if (digitIndex >= MASK_LOCAL_DIGIT_POSITIONS.length) {
        return MASK_LOCAL_DIGIT_POSITIONS[MASK_LOCAL_DIGIT_POSITIONS.length - 1] + 1;
    }
    return MASK_LOCAL_DIGIT_POSITIONS[digitIndex];
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

/** Режим «Международный номер»: любые цифры с кодом страны (E.164 без «+»). */
export function normalizePlainByDigitsInput(input: string): string {
    return input.replace(/\D/g, "").slice(0, PLAIN_PHONE_MAX_DIGITS);
}

export function isPlainByPhoneComplete(value: string): boolean {
    const digits = value.replace(/\D/g, "");
    return digits.length >= PLAIN_PHONE_MIN_DIGITS && digits.length <= PLAIN_PHONE_MAX_DIGITS;
}

export default function PhoneInput({
    value,
    onChangeAction,
    className = "",
    plainDigitsMode = false,
    showHint = true,
}: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const rootClass = ["w-full", className].filter(Boolean).join(" ");
    const hintText = plainDigitsMode ? PHONE_INPUT_HINT_PLAIN : PHONE_INPUT_HINT_MOBILE;
    const hintEl = showHint ? (
        <p className="mt-1.5 text-xs text-admin-text-muted">{hintText}</p>
    ) : null;

    if (plainDigitsMode) {
        const digits = normalizePlainByDigitsInput(value);
        return (
            <div className={rootClass}>
                <div className="flex min-h-[42px] w-full items-stretch overflow-hidden rounded-lg border border-admin-border bg-admin-surface text-admin-text shadow-sm transition focus-within:border-admin-primary focus-within:ring-2 focus-within:ring-admin-primary/15">
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={digits}
                        placeholder="79001234567"
                        onChange={(e) => {
                            onChangeAction(normalizePlainByDigitsInput(e.target.value));
                        }}
                        className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 font-mono outline-none ring-0 placeholder:text-admin-text-muted"
                    />
                </div>
                {hintEl}
            </div>
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
        <div className={rootClass}>
            <div className="flex min-h-[42px] w-full items-stretch overflow-hidden rounded-lg border border-admin-border bg-admin-surface text-admin-text shadow-sm transition focus-within:border-admin-primary focus-within:ring-2 focus-within:ring-admin-primary/15">
                <span
                    className="flex shrink-0 select-none items-center border-r border-admin-border bg-admin-muted px-3 py-2.5 font-mono text-sm font-medium tabular-nums text-admin-text-secondary"
                    aria-hidden
                >
                    +375
                </span>
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={displayValue}
                    placeholder="(29) 777-77-77"
                    onChange={() => {}}
                    onFocus={handleFocus}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 font-mono text-admin-text outline-none ring-0 placeholder:text-admin-text-muted"
                />
            </div>
            {hintEl}
        </div>
    );
}