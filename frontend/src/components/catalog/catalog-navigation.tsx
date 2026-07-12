"use client";

import { createContext, useCallback, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type CatalogNavigateOptions = {
    beforeNavigate?: () => void;
    scroll?: "preserve" | "top";
};

type CatalogNavigationValue = {
    isNavigating: boolean;
    navigate: (url: string, options?: CatalogNavigateOptions | (() => void)) => void;
};

const CatalogNavigationContext = createContext<CatalogNavigationValue | null>(null);

export function CatalogNavigationProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [isNavigating, startTransition] = useTransition();

    const navigate = useCallback(
        (url: string, options?: CatalogNavigateOptions | (() => void)) => {
            const resolved: CatalogNavigateOptions = typeof options === "function"
                ? { beforeNavigate: options }
                : (options ?? {});

            startTransition(() => {
                resolved.beforeNavigate?.();
                router.push(url, { scroll: false });

                if (resolved.scroll === "top") {
                    requestAnimationFrame(() => {
                        window.scrollTo({ top: 0, behavior: "auto" });
                    });
                }
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
