/** Откладывает задачу до idle, чтобы не конкурировать с LCP на витрине. */
export function scheduleIdleTask(task: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    const requestIdleCallback = window.requestIdleCallback;
    if (typeof requestIdleCallback === "function") {
        const id = requestIdleCallback(() => task(), { timeout: 1500 });
        return () => window.cancelIdleCallback(id);
    }

    const timeoutId = setTimeout(task, 1);
    return () => clearTimeout(timeoutId);
}

export function shouldEagerLoadUserData(pathname: string): boolean {
    return (
        pathname.startsWith("/cart")
        || pathname.startsWith("/checkout")
        || pathname.startsWith("/wishlist")
        || pathname.startsWith("/account")
        || pathname.startsWith("/login")
    );
}
