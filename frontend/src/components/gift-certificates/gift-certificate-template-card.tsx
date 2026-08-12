"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useTransition } from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { addGiftCertificateTemplateToCart } from "@/lib/cart-api";
import type { GiftCertificateTemplatePublic } from "@/lib/cart-api";
import type { ReactNode } from "react";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { withBynSign, withBynSignReplacingCode } from "@/lib/byn-sign";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

type Props = {
    template: GiftCertificateTemplatePublic;
};

function formatNominalOnCard(amount: string): ReactNode {
    const formatted = formatMoneyDisplay(amount);
    if (!formatted) {
        return amount;
    }
    if (formatted.endsWith(",00")) {
        return withBynSign(formatted.slice(0, -3));
    }
    return withBynSign(formatted);
}

export default function GiftCertificateTemplateCard({ template }: Props) {
    const { cart, setCartState } = useCart();
    const [isPending, startTransition] = useTransition();

    const cartLine = useMemo(
        () => (cart?.gift_certificate_items ?? []).find((row) => row.template_id === template.id),
        [cart?.gift_certificate_items, template.id],
    );

    const handleAddToCart = () => {
        startTransition(async () => {
            try {
                const response = await addGiftCertificateTemplateToCart(template.id, 1);
                setCartState(response.data);
            } catch {
                /* ignore */
            }
        });
    };

    const nominal = formatNominalOnCard(template.amount);

    return (
        <article className={`${siteCard} flex flex-col overflow-hidden transition hover:border-admin-border-strong hover:shadow-md`}>
            <div className="relative overflow-hidden border-b border-admin-border bg-gradient-to-br from-white via-[#fdfcfb] to-admin-muted/40 px-4 py-5">
                <Image
                    src="/logo-dark.svg"
                    alt=""
                    width={200}
                    height={46}
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 w-[min(70%,200px)] -translate-x-1/2 -translate-y-1/2 opacity-[0.07]"
                />

                <div
                    className="pointer-events-none absolute inset-2 rounded-lg border border-admin-border/60"
                    aria-hidden
                />

                <div className="relative text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-admin-text-secondary">
                        Подарочный сертификат
                    </p>
                    <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-admin-primary">
                        {nominal}
                    </p>
                    <p className="mt-1 text-xs text-admin-text-secondary">
                        {withBynSignReplacingCode(template.title)}
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between gap-2 p-3">
                {cartLine ? (
                    <>
                        <span className="text-xs text-admin-text-secondary">
                            В корзине: <span className="font-medium text-admin-text">{cartLine.qty}</span>
                        </span>
                        <Link href="/cart" className={`${siteBtnSecondary} px-3 py-2 text-xs`}>
                            Оформить
                        </Link>
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={handleAddToCart}
                        disabled={isPending}
                        className={`${siteBtnPrimary} ml-auto w-full gap-2 py-2 text-sm`}
                    >
                        <ShoppingBag className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        {isPending ? "Добавление…" : "В корзину"}
                    </button>
                )}
            </div>
        </article>
    );
}
