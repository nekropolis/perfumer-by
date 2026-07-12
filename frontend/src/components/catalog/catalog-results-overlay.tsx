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
            className="absolute inset-0 z-20 flex items-start justify-center rounded-3xl bg-[var(--background)]/70 pt-16 backdrop-blur-[2px]"
        >
            <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] shadow-lg">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
                Загружаем страницу…
            </div>
        </div>
    );
}
