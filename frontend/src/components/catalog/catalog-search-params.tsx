"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

const CatalogSearchParamsContext = createContext<URLSearchParams | null>(null);

type Props = {
    queryString: string;
    children: ReactNode;
};

export function CatalogSearchParamsProvider({ queryString, children }: Props) {
    const searchParams = useMemo(() => new URLSearchParams(queryString), [queryString]);

    return (
        <CatalogSearchParamsContext.Provider value={searchParams}>
            {children}
        </CatalogSearchParamsContext.Provider>
    );
}

export function useCatalogSearchParams(): URLSearchParams {
    const context = useContext(CatalogSearchParamsContext);
    if (!context) {
        throw new Error("useCatalogSearchParams must be used within CatalogSearchParamsProvider");
    }
    return context;
}
