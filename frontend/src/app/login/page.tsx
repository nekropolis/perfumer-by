"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import AuthModal from "@/components/auth/auth-modal";

function LoginPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tab = searchParams.get("tab") === "register" ? "register" : "login";

    const handleClose = useCallback(() => {
        router.push("/");
    }, [router]);

    return (
        <main className="min-h-[40vh] bg-[var(--background)]">
            <AuthModal open onCloseAction={handleClose} initialTab={tab} />
        </main>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<main className="min-h-[40vh] bg-[var(--background)]" />}>
            <LoginPageContent />
        </Suspense>
    );
}
