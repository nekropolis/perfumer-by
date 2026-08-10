"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

export type CookieConsentChoice = {
    /** Необязательные cookies (аналитика и т.п.). Необходимые всегда включены. */
    analytics: boolean;
    decidedAt: string;
};

const STORAGE_KEY = "perfumer:cookie-consent";

type CookieConsentContextValue = {
    choice: CookieConsentChoice | null;
    ready: boolean;
    acceptAll: () => void;
    rejectOptional: () => void;
    /** Можно ли грузить аналитику (Метрика/GTM). */
    analyticsAllowed: boolean;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

function readStoredChoice(): CookieConsentChoice | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<CookieConsentChoice>;
        if (typeof parsed.analytics !== "boolean" || typeof parsed.decidedAt !== "string") {
            return null;
        }
        return { analytics: parsed.analytics, decidedAt: parsed.decidedAt };
    } catch {
        return null;
    }
}

function writeStoredChoice(choice: CookieConsentChoice): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
    } catch {
        /* private mode */
    }
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
    const [choice, setChoice] = useState<CookieConsentChoice | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        setChoice(readStoredChoice());
        setReady(true);
    }, []);

    const persist = useCallback((next: CookieConsentChoice) => {
        writeStoredChoice(next);
        setChoice(next);
    }, []);

    const acceptAll = useCallback(() => {
        persist({ analytics: true, decidedAt: new Date().toISOString() });
    }, [persist]);

    const rejectOptional = useCallback(() => {
        persist({ analytics: false, decidedAt: new Date().toISOString() });
    }, [persist]);

    const value = useMemo<CookieConsentContextValue>(
        () => ({
            choice,
            ready,
            acceptAll,
            rejectOptional,
            analyticsAllowed: Boolean(choice?.analytics),
        }),
        [choice, ready, acceptAll, rejectOptional],
    );

    return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent(): CookieConsentContextValue {
    const ctx = useContext(CookieConsentContext);
    if (!ctx) {
        throw new Error("useCookieConsent must be used within CookieConsentProvider");
    }
    return ctx;
}
