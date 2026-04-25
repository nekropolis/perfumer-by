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
import { fetchCart } from "@/lib/cart-api";
import type { CartData } from "@/types/cart";
import { useAuth } from "@/components/auth/auth-provider";

type CartContextType = {
    cart: CartData | null;
    cartQty: number;
    loading: boolean;
    refreshCart: () => Promise<void>;
    setCartState: (cart: CartData | null) => void;
};

const CartContext = createContext<CartContextType | null>(null);

type Props = {
    children: ReactNode;
};

export function CartProvider({ children }: Props) {
    const { isAuthenticated, user } = useAuth();
    const [cart, setCart] = useState<CartData | null>(null);
    const [loading, setLoading] = useState(true);

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

    useEffect(() => {
        void refreshCart();
    }, [refreshCart]);

    useEffect(() => {
        // After login/logout or user switch, refetch cart with current auth context
        // so linked loyalty card and pricing are reflected immediately.
        void refreshCart();
    }, [isAuthenticated, user?.id, refreshCart]);

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
        throw new Error("useCart must be used inside CartProvider");
    }

    return context;
}