type HomeTemplateProps = {
    heroTitle: string;
    heroDescription: string;
    contentHtml: string;
};

const categories = [
    { title: "Женская парфюмерия", description: "Популярные и нишевые ароматы для неё", href: "/catalog?category=women" },
    { title: "Мужская парфюмерия", description: "Классические и современные композиции", href: "/catalog?category=men" },
    { title: "Тестеры и миниатюры", description: "Удобный формат для знакомства с ароматом", href: "/catalog?type=testers" },
];

const promos = [
    { title: "Скидки до 30%", description: "На избранные ароматы этой недели", href: "/catalog?sale=1" },
    { title: "Новинки каталога", description: "Недавно добавленные товары", href: "/catalog?sort=new" },
    { title: "Хиты продаж", description: "Самые популярные позиции магазина", href: "/catalog?sort=hit" },
];

const featuredProducts = [
    { id: 1, name: "Tom Ford Lost Cherry", brand: "Tom Ford", price: "420.00", oldPrice: "480.00" },
    { id: 2, name: "Maison Francis Kurkdjian Baccarat Rouge 540", brand: "MFK", price: "560.00", oldPrice: null },
    { id: 3, name: "Initio Oud for Greatness", brand: "Initio", price: "510.00", oldPrice: "590.00" },
    { id: 4, name: "Xerjoff Erba Pura", brand: "Xerjoff", price: "390.00", oldPrice: null },
];

function ProductCard({
    name,
    brand,
    price,
    oldPrice,
}: {
    name: string;
    brand: string;
    price: string;
    oldPrice: string | null;
}) {
    return (
        <div className="group rounded-3xl border bg-white p-4 transition hover:-translate-y-[1px] hover:shadow-sm">
            <div className="mb-4 aspect-[4/5] rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100" />
            <div className="mb-1 text-sm text-gray-500">{brand}</div>
            <div className="line-clamp-2 min-h-[48px] text-base font-medium leading-6">{name}</div>
            <div className="mt-4 flex items-end gap-2">
                <div className="text-lg font-semibold">{price} руб.</div>
                {oldPrice ? <div className="text-sm text-gray-400 line-through">{oldPrice} руб.</div> : null}
            </div>
        </div>
    );
}

export default function HomeTemplate({ heroTitle, heroDescription, contentHtml }: HomeTemplateProps) {
    return (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-12 sm:px-6 lg:px-8">
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[28px] bg-black px-6 py-8 text-white sm:px-8 sm:py-10">
                    <div className="mb-3 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs text-white/80">
                        Оригинальная парфюмерия
                    </div>
                    <h1 className="max-w-[14ch] text-4xl font-semibold leading-tight sm:text-5xl">{heroTitle}</h1>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">{heroDescription}</p>
                </div>

                <div className="rounded-[28px] border bg-white p-6">
                    <div className="mb-2 text-sm text-gray-500">Нужна помощь?</div>
                    <div className="text-2xl font-semibold leading-tight">Поможем подобрать аромат</div>
                    <p className="mt-3 text-sm leading-6 text-gray-600">Подскажем по концентрации, объёму, стойкости и подходящему случаю.</p>
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5">
                    <h2 className="text-2xl font-semibold">Популярные категории</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {categories.map((category) => (
                        <a key={category.title} href={category.href} className="rounded-3xl border bg-white p-6 transition hover:-translate-y-[1px] hover:shadow-sm">
                            <div className="text-xl font-semibold">{category.title}</div>
                            <p className="mt-2 text-sm leading-6 text-gray-600">{category.description}</p>
                        </a>
                    ))}
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5">
                    <h2 className="text-2xl font-semibold">Акции и подборки</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {promos.map((promo, index) => (
                        <a
                            key={promo.title}
                            href={promo.href}
                            className={`rounded-3xl px-6 py-7 transition hover:-translate-y-[1px] hover:shadow-sm ${index === 0 ? "bg-black text-white" : "border bg-white text-black"}`}
                        >
                            <div className={`text-2xl font-semibold ${index === 0 ? "text-white" : ""}`}>{promo.title}</div>
                            <p className={`mt-2 text-sm leading-6 ${index === 0 ? "text-white/75" : "text-gray-600"}`}>{promo.description}</p>
                        </a>
                    ))}
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5">
                    <h2 className="text-2xl font-semibold">Рекомендуем</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {featuredProducts.map((product) => (
                        <ProductCard key={product.id} {...product} />
                    ))}
                </div>
            </section>

            <section className="mt-10 rounded-[28px] border bg-white p-6 sm:p-8">
                <h2 className="text-2xl font-semibold">О магазине</h2>
                {contentHtml ? (
                    <div className="ProseMirror prose prose-sm mt-4 max-w-none sm:prose-base" dangerouslySetInnerHTML={{ __html: contentHtml }} />
                ) : (
                    <p className="mt-3 text-sm leading-7 text-gray-600">
                        Контент главной управляется из админки: раздел `Страницы`, slug `glavnaya`.
                    </p>
                )}
            </section>
        </main>
    );
}
