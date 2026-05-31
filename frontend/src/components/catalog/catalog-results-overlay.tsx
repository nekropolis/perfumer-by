"use client";

import { useCatalogNavigation } from "@/components/catalog/catalog-navigation";

export default function CatalogResultsOverlay() {
    const { isNavigating } = useCatalogNavigation();

    if (!isNavigating) {
        return null;
    }

    return (
        <div
            aria-hidden
            className="absolute inset-0 z-20 rounded-3xl bg-[var(--background)]/55 backdrop-blur-[1px]"
        >
            <div className="sticky top-28 flex justify-center pt-10">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] shadow-md">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
                    Обновляем…
                </div>
            </div>
        </div>
    );
}
