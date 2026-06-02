"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
    value: string;
    label?: string;
    copiedLabel?: string;
    className?: string;
    iconSize?: number;
    title?: string;
};

export async function writeToClipboard(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fall through to legacy path
    }

    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

export default function CopyText({
    value,
    label,
    copiedLabel = "Скопировано",
    className = "",
    iconSize = 14,
    title,
}: Props) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
            }
        };
    }, []);

    const handleCopy = useCallback(async () => {
        const ok = await writeToClipboard(value);
        if (!ok) return;
        setCopied(true);
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
            setCopied(false);
            timerRef.current = null;
        }, 1500);
    }, [value]);

    return (
        <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? copiedLabel : `Скопировать ${label ?? value}`}
            title={title ?? (copied ? copiedLabel : "Скопировать")}
            className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition select-none hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-[0.98] ${
                copied ? "text-emerald-600" : ""
            } ${className}`}
        >
            <span className="tabular-nums">{label ?? value}</span>
            {copied ? (
                <Check size={iconSize} className="shrink-0" />
            ) : (
                <Copy size={iconSize} className="shrink-0 opacity-70" />
            )}
            {copied ? (
                <span className="text-[11px] font-medium">{copiedLabel}</span>
            ) : null}
        </button>
    );
}
