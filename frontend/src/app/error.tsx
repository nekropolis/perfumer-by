"use client";

import Link from "next/link";
import { useEffect } from "react";

type ErrorPageProps = {
    error: Error & { digest?: string };
    reset: () => void;
};

/** Общая витрина ошибки сегмента — визуально как 404. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
    useEffect(() => {
        console.error("[app/error]", error.digest ? { digest: error.digest, error } : error);
    }, [error]);

    return (
        <main className="mx-auto max-w-lg px-6 py-16 text-center md:py-28">
            <p
                className="font-display text-7xl font-semibold tracking-tight sm:text-8xl"
                aria-hidden="true"
                style={{ color: "var(--accent)" }}
            >
                !
            </p>
            <h1 className="mt-6 text-xl font-semibold text-[var(--foreground)] md:text-2xl">Что-то пошло не так</h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                Не удалось загрузить страницу. Попробуйте ещё раз или перейдите в каталог.
            </p>
            {process.env.NODE_ENV === "development" && error.message ? (
                <p className="mt-4 break-words text-left text-xs text-red-600">{error.message}</p>
            ) : null}
            <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
                <button
                    type="button"
                    className="inline-flex min-h-[2.75rem] items-center justify-center rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--background)] transition hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] sm:min-h-0"
                    onClick={() => reset()}
                >
                    Повторить
                </button>
                <Link
                    className="inline-flex min-h-[2.75rem] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] sm:min-h-0"
                    href="/"
                >
                    На главную
                </Link>
                <Link
                    className="inline-flex min-h-[2.75rem] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] sm:min-h-0"
                    href="/catalog"
                >
                    Каталог
                </Link>
            </div>
        </main>
    );
}
