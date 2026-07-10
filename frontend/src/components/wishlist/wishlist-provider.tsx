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
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { isClientUser } from "@/constants/admin-roles";
import { scheduleIdleTask, shouldEagerLoadUserData } from "@/lib/schedule-idle-task";
import {
    addWishlistItem,
    fetchWishlist,
    previewWishlist,
    removeWishlistItem,
    syncWishlistItems,
} from "@/lib/wishlist-api";
import type { ProductListItem } from "@/types/catalog";

const WISHLIST_STORAGE_KEY = "perfumer_wishlist_product_ids";

type WishlistContextType = {
    productIds: number[];
    products: ProductListItem[];
    wishlistQty: number;
    loading: boolean;
    isInWishlist: (productId: number) => boolean;
    addToWishlist: (productId: number) => Promise<void>;
    removeFromWishlist: (productId: number) => Promise<void>;
    toggleWishlist: (productId: number) => Promise<void>;
    refreshWishlist: () => Promise<void>;
};

const WishlistContext = createContext<WishlistContextType | null>(null);

function readLocalWishlistIds(): number[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item > 0)
            .filter((item, index, all) => all.indexOf(item) === index);
    } catch {
        return [];
    }
}

function writeLocalWishlistIds(ids: number[]): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(ids));
    } catch {
        // ignore localStorage write errors
    }
}

type Props = {
    children: ReactNode;
};

export function WishlistProvider({ children }: Props) {
    const pathname = usePathname();
    const { isAuthenticated, user, loading: authLoading } = useAuth();
    const canSyncWishlist = isAuthenticated && isClientUser(user);
    const [productIds, setProductIds] = useState<number[]>([]);
    const [products, setProducts] = useState<ProductListItem[]>([]);
    const [loading, setLoading] = useState(true);

    const applyResponse = useCallback((response: { data: ProductListItem[] }) => {
        const nextProducts = response.data || [];
        const nextIds = nextProducts.map((item) => item.id);
        setProducts(nextProducts);
        setProductIds(nextIds);
        writeLocalWishlistIds(nextIds);
    }, []);

    const refreshWishlist = useCallback(async () => {
        if (canSyncWishlist) {
            const response = await fetchWishlist();
            applyResponse(response);
            return;
        }

        const localIds = readLocalWishlistIds();
        if (localIds.length === 0) {
            setProductIds([]);
            setProducts([]);
            writeLocalWishlistIds([]);
            return;
        }

        const response = await previewWishlist(localIds);
        applyResponse(response);
    }, [applyResponse, canSyncWishlist]);

    useEffect(() => {
        if (authLoading) {
            return;
        }

        let cancelled = false;

        const init = async () => {
            setLoading(true);

            try {
                if (!canSyncWishlist) {
                    const localIds = readLocalWishlistIds();
                    if (localIds.length === 0) {
                        if (!cancelled) {
                            setProductIds([]);
                            setProducts([]);
                        }
                        return;
                    }

                    const preview = await previewWishlist(localIds);
                    if (!cancelled) {
                        applyResponse(preview);
                    }
                    return;
                }

                const localIds = readLocalWishlistIds();
                const remote = await fetchWishlist();
                const remoteIds = (remote.data || []).map((item) => item.id);
                const mergedIds = Array.from(new Set([...localIds, ...remoteIds]));

                if (mergedIds.length === 0) {
                    if (!cancelled) {
                        setProductIds([]);
                        setProducts([]);
                        writeLocalWishlistIds([]);
                    }
                    return;
                }

                const result = localIds.length > 0 ? await syncWishlistItems(mergedIds) : remote;
                if (!cancelled) {
                    applyResponse(result);
                }
            } catch (error) {
                console.error("Wishlist init failed", error);
                if (!cancelled) {
                    const fallbackIds = readLocalWishlistIds();
                    setProductIds(fallbackIds);
                    try {
                        const preview = await previewWishlist(fallbackIds);
                        if (!cancelled) {
                            setProducts(preview.data || []);
                        }
                    } catch (previewError) {
                        console.error("Wishlist preview fallback failed", previewError);
                        setProducts([]);
                    }
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        const run = () => {
            if (!cancelled) {
                void init();
            }
        };

        if (shouldEagerLoadUserData(pathname)) {
            void init();
            return () => {
                cancelled = true;
            };
        }

        const cancelIdle = scheduleIdleTask(run);
        return () => {
            cancelled = true;
            cancelIdle();
        };
    }, [applyResponse, authLoading, canSyncWishlist, pathname]);

    const addToWishlist = useCallback(
        async (productId: number) => {
            if (productId <= 0) {
                return;
            }
            if (productIds.includes(productId)) {
                return;
            }

            const optimisticIds = [...productIds, productId];
            setProductIds(optimisticIds);
            writeLocalWishlistIds(optimisticIds);

            try {
                if (canSyncWishlist) {
                    const response = await addWishlistItem(productId);
                    applyResponse(response);
                } else {
                    const response = await previewWishlist(optimisticIds);
                    applyResponse(response);
                }
            } catch (error) {
                console.error("Add to wishlist failed", error);
                await refreshWishlist();
            }
        },
        [applyResponse, canSyncWishlist, productIds, refreshWishlist]
    );

    const removeFromWishlist = useCallback(
        async (productId: number) => {
            if (productId <= 0) {
                return;
            }
            if (!productIds.includes(productId)) {
                return;
            }

            const optimisticIds = productIds.filter((id) => id !== productId);
            setProductIds(optimisticIds);
            writeLocalWishlistIds(optimisticIds);

            try {
                if (canSyncWishlist) {
                    const response = await removeWishlistItem(productId);
                    applyResponse(response);
                } else if (optimisticIds.length > 0) {
                    const response = await previewWishlist(optimisticIds);
                    applyResponse(response);
                } else {
                    setProducts([]);
                }
            } catch (error) {
                console.error("Remove from wishlist failed", error);
                await refreshWishlist();
            }
        },
        [applyResponse, canSyncWishlist, productIds, refreshWishlist]
    );

    const toggleWishlist = useCallback(
        async (productId: number) => {
            if (productIds.includes(productId)) {
                await removeFromWishlist(productId);
                return;
            }
            await addToWishlist(productId);
        },
        [addToWishlist, productIds, removeFromWishlist]
    );

    const value = useMemo<WishlistContextType>(
        () => ({
            productIds,
            products,
            wishlistQty: productIds.length,
            loading,
            isInWishlist: (productId: number) => productIds.includes(productId),
            addToWishlist,
            removeFromWishlist,
            toggleWishlist,
            refreshWishlist,
        }),
        [addToWishlist, loading, productIds, products, refreshWishlist, removeFromWishlist, toggleWishlist]
    );

    return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
    const context = useContext(WishlistContext);
    if (!context) {
        throw new Error("useWishlist must be used inside WishlistProvider");
    }
    return context;
}
