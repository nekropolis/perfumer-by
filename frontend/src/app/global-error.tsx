"use client";

import Link from "next/link";
import { useEffect } from "react";
import "./globals.css";

type GlobalErrorProps = {
    error: Error & { digest?: string };
    reset: () => void;
};

/** Критическая ошибка корневого layout — без провайдеров и оболочки сайта. */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
    useEffect(() => {
        console.error("[app/global-error]", error.digest ? { digest: error.digest, error } : error);
    }, [error]);

    return (
        <html lang="ru">
            <head>
                <meta name="robots" content="noindex" />
                <title>Ошибка — Perfumer</title>
            </head>
            <body className="min-h-screen bg-[var(--background)] font-sans text-[var(--foreground)] antialiased">
                <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
                    <h1 className="text-xl font-semibold md:text-2xl">Что-то пошло не так</h1>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                        Произошла непредвиденная ошибка. Попробуйте обновить страницу или вернитесь на главную.
                    </p>
                    <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
                        <button
                            type="button"
                            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--background)] transition hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]"
                            onClick={() => reset()}
                        >
                            Повторить
                        </button>
                        <Link
                            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                            href="/"
                        >
                            На главную
                        </Link>
                    </div>
                </main>
            </body>
        </html>
    );
}
