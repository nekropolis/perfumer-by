"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { fetchCart } from "@/lib/cart-api";
import type { CartData } from "@/types/cart";
import { useAuth } from "@/components/auth/auth-provider";

function isNavigationReload(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    const nav = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload") {
        return true;
    }
    const legacy = (performance as unknown as { navigation?: { type?: number } }).navigation;
    return legacy?.type === 1;
}

type CartContextType = {
    cart: CartData | null;
    cartQty: number;
    loading: boolean;
    refreshCart: () => Promise<void>;
    setCartState: (cart: CartData | null) => void;
};

const CartContext = createContext<CartContextType | null>(null);

const cartSsrFallback: CartContextType = {
    cart: null,
    cartQty: 0,
    loading: true,
    refreshCart: async () => {},
    setCartState: () => {},
};

type Props = {
    children: ReactNode;
};

export function CartProvider({ children }: Props) {
    const { isAuthenticated, user } = useAuth();
    const [cart, setCart] = useState<CartData | null>(null);
    const [loading, setLoading] = useState(true);
    const loyaltyReloadBootstrapSentRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const sendBootstrap =
                    !loyaltyReloadBootstrapSentRef.current && isNavigationReload();
                if (sendBootstrap) {
                    loyaltyReloadBootstrapSentRef.current = true;
                }
                const response = await fetchCart({
                    loyaltyBootstrapReload: sendBootstrap,
                });
                if (!cancelled) {
                    setCart(response.data);
                }
            } catch (error) {
                console.error("Failed to fetch cart", error);
                if (!cancelled) {
                    setCart(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, user?.id]);

    const refreshCart = useCallback(async () => {
        try {
            const response = await fetchCart();
            setCart(response.data);
        } catch (error) {
            console.error("Failed to fetch cart", error);
            setCart(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const cartQty = useMemo(() => {
        if (!cart) {
            return 0;
        }

        const productsQty = cart.items.reduce((sum, item) => sum + item.qty, 0);
        const giftCertificatesQty = (cart.gift_certificate_items ?? []).reduce((sum, item) => sum + item.qty, 0);

        return productsQty + giftCertificatesQty;
    }, [cart]);

    const value = useMemo<CartContextType>(
        () => ({
            cart,
            cartQty,
            loading,
            refreshCart,
            setCartState: setCart,
        }),
        [cart, cartQty, loading, refreshCart]
    );

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
    const context = useContext(CartContext);

    if (!context) {
        if (typeof window === "undefined") {
            return cartSsrFallback;
        }
        throw new Error("useCart must be used inside CartProvider");
    }

    return context;
}
