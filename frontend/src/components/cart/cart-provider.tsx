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

    const cartQty = useMemo(() => {
        if (!cart?.items?.length) {
            return 0;
        }

        return cart.items.reduce((sum, item) => sum + item.qty, 0);
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