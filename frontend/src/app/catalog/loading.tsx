export default function CatalogLoading() {
    return (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
            <div className="mb-4 h-4 w-40 animate-pulse rounded bg-[var(--line)]" />

            <div className="mb-8 h-10 w-64 animate-pulse rounded-2xl bg-[var(--line)]" />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="hidden lg:block">
                    <div className="rounded-xl border border-admin-border bg-admin-surface p-5 shadow-sm">
                        <div className="space-y-4">
                            {Array.from({ length: 5 }).map((_, index) => (
                                <div key={index} className="space-y-2">
                                    <div className="h-4 w-24 animate-pulse rounded bg-[var(--line)]" />
                                    <div className="h-8 animate-pulse rounded bg-[var(--line)]" />
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>

                <section className="min-w-0 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="h-9 w-40 animate-pulse rounded-2xl bg-[var(--line)]" />
                        <div className="h-9 w-28 animate-pulse rounded-2xl bg-[var(--line)] lg:hidden" />
                    </div>

                    <div className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <div
                                key={index}
                                className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"
                            >
                                <div className="aspect-[4/5] animate-pulse bg-[var(--line)]" />
                                <div className="space-y-2 p-4">
                                    <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--line)]" />
                                    <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--line)]" />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
