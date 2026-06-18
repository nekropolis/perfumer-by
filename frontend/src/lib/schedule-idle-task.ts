/** Откладывает задачу до idle, чтобы не конкурировать с LCP на витрине. */
export function scheduleIdleTask(task: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(() => task(), { timeout: 1500 });
        return () => window.cancelIdleCallback(id);
    }

    const timeoutId = window.setTimeout(task, 1);
    return () => window.clearTimeout(timeoutId);
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
