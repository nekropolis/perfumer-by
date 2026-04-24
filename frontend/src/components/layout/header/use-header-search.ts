"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type {
    HeaderSearchBrandItem,
    HeaderSearchItem,
} from "@/components/layout/header/types";

type HeaderSearchResponse = {
    data: {
        brands: HeaderSearchBrandItem[];
        products: HeaderSearchItem[];
    };
};

const RECENT_SEARCHES_STORAGE_KEY = "perfumer_recent_searches";

function readRecentSearches(): string[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter(
                (item): item is string =>
                    typeof item === "string" && item.trim().length > 0,
            )
            .slice(0, 8);
    } catch {
        return [];
    }
}

type UseHeaderSearchOptions = {
    onAfterNavigateAction: () => void;
};

export function useHeaderSearch({
    onAfterNavigateAction,
}: UseHeaderSearchOptions) {
    const router = useRouter();
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<HeaderSearchItem[]>([]);
    const [searchBrandResults, setSearchBrandResults] = useState<
        HeaderSearchBrandItem[]
    >([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            setRecentSearches(readRecentSearches());
        }, 0);

        return () => {
            window.clearTimeout(timerId);
        };
    }, []);

    useEffect(() => {
        const query = searchQuery.trim();
        if (!searchOpen || query.length < 2) {
            return;
        }

        let cancelled = false;
        const timeoutId = setTimeout(() => {
            void apiFetch<HeaderSearchResponse>(
                `/catalog/products/smart-search?q=${encodeURIComponent(query)}&limit=16`,
            )
                .then((res) => {
                    if (!cancelled) {
                        setSearchBrandResults(res.data?.brands ?? []);
                        setSearchResults(res.data?.products ?? []);
                    }
                })
                .catch((error) => {
                    if (!cancelled) {
                        console.error(error);
                        setSearchBrandResults([]);
                        setSearchResults([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setSearchLoading(false);
                    }
                });
        }, 260);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [searchOpen, searchQuery]);

    const resetSearch = () => {
        setSearchQuery("");
        setSearchLoading(false);
        setSearchBrandResults([]);
        setSearchResults([]);
        setSearchOpen(false);
    };

    const handleSearchChange = (next: string) => {
        setSearchQuery(next);
        setSearchOpen(true);

        if (next.trim().length < 2) {
            setSearchLoading(false);
            setSearchBrandResults([]);
            setSearchResults([]);
        } else {
            setSearchLoading(true);
        }
    };

    const submitSearchPage = () => {
        const query = searchQuery.trim();
        if (!query) {
            return;
        }

        const nextRecent = [
            query,
            ...recentSearches.filter(
                (item) => item.toLowerCase() !== query.toLowerCase(),
            ),
        ].slice(0, 8);

        setRecentSearches(nextRecent);
        try {
            window.localStorage.setItem(
                RECENT_SEARCHES_STORAGE_KEY,
                JSON.stringify(nextRecent),
            );
        } catch {
            // ignore storage write errors
        }

        setSearchOpen(false);
        onAfterNavigateAction();
        router.push(`/search?query=${encodeURIComponent(query)}`);
    };

    const clearRecentSearches = () => {
        setRecentSearches([]);
        try {
            window.localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
        } catch {
            // ignore storage errors
        }
    };

    const handleSelectProduct = (slug: string) => {
        resetSearch();
        onAfterNavigateAction();
        router.push(`/product/${slug}`);
    };

    const handleSelectBrand = (slug: string) => {
        resetSearch();
        onAfterNavigateAction();
        router.push(`/brands/${encodeURIComponent(slug)}`);
    };

    const selectSuggestion = (value: string) => {
        setSearchQuery(value);
        setSearchLoading(true);
        setSearchOpen(true);
    };

    return {
        searchOpen,
        setSearchOpen,
        searchQuery,
        searchLoading,
        searchResults,
        searchBrandResults,
        recentSearches,
        resetSearch,
        handleSearchChange,
        submitSearchPage,
        clearRecentSearches,
        handleSelectProduct,
        handleSelectBrand,
        selectSuggestion,
    };
}
