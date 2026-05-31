"use client";

//import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchGiftCertificateTemplates, type GiftCertificateTemplatePublic } from "@/lib/cart-api";
//import { useCart } from "@/components/cart/cart-provider";
import CmsSnippet from "@/components/cms/cms-snippet";

export default function GiftCertificatesCatalogPage() {
    //const { setCartState } = useCart();
    const [templates, setTemplates] = useState<GiftCertificateTemplatePublic[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    // const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;
        void fetchGiftCertificateTemplates()
            .then((res) => {
                if (cancelled) return;
                setTemplates(res.data);
            })
            .catch(() => {
                if (cancelled) return;
                setError("Не удалось загрузить шаблоны сертификатов");
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <h1 className="mb-2 text-3xl font-semibold">Подарочные сертификаты</h1>
            {/* <p className="mb-8 text-[var(--text-secondary)]">
                Выберите номинал сертификата и добавьте его в корзину как отдельную позицию.
            </p>*/}

            {loading ? <div className="text-sm text-[var(--text-secondary)]">Загрузка...</div> : null}
            {error ? <div className="text-sm text-red-600">{error}</div> : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                    <article key={template.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
                        <div className="text-lg font-semibold">{template.title}</div>
                        <div className="mt-1 text-sm text-[var(--text-secondary)]">Номинал: {template.amount} руб.</div>
                        {/* <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                                startTransition(async () => {
                                    const response = await addGiftCertificateTemplateToCart(template.id, 1);
                                    setCartState(response.data);
                                })
                            }
                            className="mt-5 rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                        >
                            В корзину
                        </button> */}
                    </article>
                ))}
            </div>

            <div className="mt-8">
                {/* <Link href="/cart" className="text-sm underline">
                    Перейти в корзину
                </Link> */}
            </div>

            <CmsSnippet
                code="faq-sertifikaty"
                className="mt-10 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
                fallbackTitle="Вопросы по сертификатам"
            />
        </main>
    );
}
