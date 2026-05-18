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
import { fetchMe, type AuthUserProfile } from "@/lib/auth-api";
import { clearAuthToken, getAuthToken, setAuthToken } from "@/lib/auth-token";

type AuthUser = AuthUserProfile;

type AuthContextType = {
    user: AuthUser | null;
    isAuthenticated: boolean;
    loading: boolean;
    refreshUser: () => Promise<void>;
    login: (token: string, user?: AuthUser | null) => Promise<void>;
    logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

type Props = {
    children: ReactNode;
};

export function AuthProvider({ children }: Props) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        const token = getAuthToken();

        if (!token) {
            setUser(null);
            setLoading(false);
            return;
        }

        try {
            const response = await fetchMe(token);
            if (!response.data) {
                clearAuthToken();
                setUser(null);
            } else {
                setUser(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch auth user", error);
            clearAuthToken();
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refreshUser();
    }, [refreshUser]);

    const login = useCallback(
        async (token: string, authUser?: AuthUser | null) => {
            setAuthToken(token);
            setLoading(true);

            if (authUser) {
                // Optimistic user to unlock guarded routes quickly.
                setUser(authUser);
            }

            await refreshUser();
        },
        [refreshUser]
    );

    const logout = useCallback(() => {
        clearAuthToken();
        setUser(null);
        setLoading(false);
    }, []);

    const value = useMemo<AuthContextType>(
        () => ({
            user,
            isAuthenticated: !!user,
            loading,
            refreshUser,
            login,
            logout,
        }),
        [user, loading, refreshUser, login, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}