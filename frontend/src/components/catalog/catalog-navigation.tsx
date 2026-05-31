"use client";

import { createContext, useCallback, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type CatalogNavigationValue = {
    isNavigating: boolean;
    navigate: (url: string, beforeNavigate?: () => void) => void;
};

const CatalogNavigationContext = createContext<CatalogNavigationValue | null>(null);

export function CatalogNavigationProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [isNavigating, startTransition] = useTransition();

    const navigate = useCallback(
        (url: string, beforeNavigate?: () => void) => {
            startTransition(() => {
                beforeNavigate?.();
                router.push(url, { scroll: false });
            });
        },
        [router]
    );

    return (
        <CatalogNavigationContext.Provider value={{ isNavigating, navigate }}>
            {children}
        </CatalogNavigationContext.Provider>
    );
}

export function useCatalogNavigation(): CatalogNavigationValue {
    const ctx = useContext(CatalogNavigationContext);
    if (!ctx) {
        throw new Error("useCatalogNavigation must be used within CatalogNavigationProvider");
    }
    return ctx;
}
