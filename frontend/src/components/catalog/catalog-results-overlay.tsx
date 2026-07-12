"use client";

import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";

export default function CatalogResultsOverlay() {
    const { isNavigating } = useCatalogNavigation();

    if (!isNavigating) {
        return null;
    }

    return (
        <div
            aria-live="polite"
            aria-busy="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-3xl bg-[var(--background)]/70 backdrop-blur-[2px]"
        />
    );
}
