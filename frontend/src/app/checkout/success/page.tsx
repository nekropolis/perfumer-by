import Link from "next/link";
import { CheckCircle2, Package } from "lucide-react";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

type Props = {
    searchParams: Promise<{
        order?: string;
    }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
    const params = await searchParams;
    const orderId = params.order;

    return (
        <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
            <div className={`${siteCard} p-8 text-center sm:p-10`}>
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-9 w-9" strokeWidth={2} aria-hidden />
                </div>

                <h1 className="mb-3 text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                    Заказ оформлен
                </h1>

                <p className="mb-6 text-sm leading-relaxed text-admin-text-secondary sm:text-base">
                    Спасибо за покупку. Мы свяжемся с вами для подтверждения доставки и оплаты.
                </p>

                {orderId ? (
                    <div className="mb-8 inline-flex items-center gap-2 rounded-lg border border-admin-border bg-admin-muted px-4 py-2.5 text-sm text-admin-text">
                        <Package className="h-4 w-4 shrink-0 text-admin-text-secondary" aria-hidden />
                        <span>
                            Номер заказа: <span className="font-semibold">#{orderId}</span>
                        </span>
                    </div>
                ) : null}

                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                    <Link href="/account" className={siteBtnPrimary}>
                        Мои заказы
                    </Link>
                    <Link href="/catalog" className={siteBtnSecondary}>
                        В каталог
                    </Link>
                </div>
            </div>
        </main>
    );
}
