import Link from "next/link";

/** Общая витрина 404: общий вид для явного `notFound()` и для несовпадающих маршрутов. */
export default function StoreNotFoundView() {
    return (
        <main className="mx-auto max-w-lg px-6 py-16 text-center md:py-28">
            <p
                className="font-display text-7xl font-semibold tracking-tight sm:text-8xl"
                aria-hidden="true"
                style={{ color: "var(--accent)" }}
            >
                404
            </p>
            <h1 className="mt-6 text-xl font-semibold text-[var(--foreground)] md:text-2xl">Страница не найдена</h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                Ссылка неверная или страница снята с публикации. Перейдите в каталог или выберите раздел ниже.
            </p>
            <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
                <Link
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent)] px-7 text-base font-semibold text-[var(--background)] transition hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]"
                    href="/"
                >
                    На главную
                </Link>
                <Link
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-7 text-base font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                    href="/catalog"
                >
                    Каталог
                </Link>
                <Link
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-7 text-base font-medium text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
                    href="/brands"
                >
                    Бренды
                </Link>
            </div>
        </main>
    );
}
