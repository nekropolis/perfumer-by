import Link from "next/link";

type Props = {
    searchParams: Promise<{
        order?: string;
    }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
    const params = await searchParams;
    const orderId = params.order;

    return (
        <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center sm:p-10">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--background)] text-2xl">
                    ✓
                </div>

                <h1 className="mb-4 text-3xl font-semibold">Заказ оформлен</h1>

                <p className="mb-6 text-[var(--text-secondary)]">
                    Спасибо за заказ. Мы скоро свяжемся с вами для подтверждения.
                </p>

                {orderId && (
                    <div className="mb-8 text-lg">
                        Номер заказа: <span className="font-semibold">#{orderId}</span>
                    </div>
                )}

                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                    <Link
                        href="/catalog"
                        className="rounded-xl bg-[var(--accent)] px-5 py-3 text-white"
                    >
                        Вернуться в каталог
                    </Link>

                    <Link
                        href="/cart"
                        className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-3"
                    >
                        Перейти в корзину
                    </Link>
                </div>
            </div>
        </main>
    );
}