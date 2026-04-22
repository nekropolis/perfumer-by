import Link from "next/link";

type HomeTemplateProps = {
    heroTitle: string;
    heroDescription: string;
    contentHtml: string;
};

const categories = [
    { title: "Женская парфюмерия", description: "Популярные и нишевые ароматы для неё", href: "/catalog?category=women" },
    { title: "Мужская парфюмерия", description: "Классические и современные композиции", href: "/catalog?category=men" },
    { title: "Тестеры и миниатюры", description: "Удобный формат для знакомства с ароматом", href: "/catalog?type=testers" },
    { title: "Нишевая селекция", description: "Редкие композиции и коллекционные релизы", href: "/catalog?collection=niche" },
];

const promos = [
    { title: "Сезонная подборка", description: "Тёплые шлейфовые композиции для вечера и прохладных дней.", href: "/catalog?sale=1" },
    { title: "Новые поступления", description: "Свежие релизы брендов, которые уже доступны в каталоге.", href: "/catalog?sort=new" },
];

const brands = [
    "Tom Ford",
    "Maison Francis Kurkdjian",
    "Xerjoff",
    "Parfums de Marly",
    "Byredo",
    "Amouage",
];

const trustItems = [
    { title: "Оригинальная продукция", description: "Поставки от официальных дистрибьюторов и проверенных партнёров." },
    { title: "Бережная упаковка", description: "Каждый заказ собирается вручную и защищается для доставки." },
    { title: "Консультация эксперта", description: "Подбираем аромат по сезону, случаю и личным предпочтениям." },
    { title: "Быстрая доставка", description: "По Минску и по всей Беларуси в удобные для клиента интервалы." },
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
        <div className="group rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:-translate-y-[2px] hover:shadow-[0_16px_30px_rgba(31,23,34,0.08)]">
            <div className="mb-4 aspect-[4/5] rounded-[20px] bg-gradient-to-b from-[#F2ECE7] to-[#ECE5DF]" />
            <div className="mb-1 text-sm text-gray-500">{brand}</div>
            <div className="line-clamp-2 min-h-[48px] text-base font-medium leading-6">{name}</div>
            <div className="mt-4 flex items-end gap-2">
                <div className="text-lg font-semibold text-[var(--foreground)]">{price} руб.</div>
                {oldPrice ? <div className="text-sm text-gray-400 line-through">{oldPrice} руб.</div> : null}
            </div>
        </div>
    );
}

export default function HomeTemplate({ heroTitle, heroDescription, contentHtml }: HomeTemplateProps) {
    return (
        <main className="mx-auto max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-8">
            <section className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--background)] px-5 py-7 md:px-8 md:py-9">
                <div className="flex flex-col gap-6 md:flex-row md:items-center">
                    <div className="order-1 md:min-w-0 md:flex-[1.28]">
                        <div className="mb-4 inline-flex rounded-full border border-[var(--accent-soft)] px-3 py-1 text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
                            Soft Luxury Editorial
                        </div>
                        <h1 className="font-display max-w-[19ch] text-5xl leading-[0.95] text-[var(--foreground)] sm:text-6xl">
                            {heroTitle}
                        </h1>
                        <p className="mt-4 max-w-[44ch] text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                            {heroDescription}
                        </p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <Link href="/catalog" className="inline-flex items-center justify-center rounded-[16px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5C3E69]">
                                Смотреть каталог
                            </Link>
                            <Link href="/brands" className="inline-flex items-center justify-center rounded-[16px] border border-[var(--accent-soft)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[#F5EFF8]">
                                Популярные бренды
                            </Link>
                        </div>
                    </div>

                    <div className="order-2 relative mx-auto w-full max-w-[360px] md:mx-0 md:ml-auto md:flex-[0.72]">
                        <div className="rounded-[28px] border border-[var(--line)] bg-gradient-to-b from-[#F4EEE8] to-[#ECE5DF] p-6">
                            <div className="relative h-72">
                                <div className="absolute left-1/2 top-5 h-56 w-36 -translate-x-1/2 rounded-[28px] border border-[#b59a8f] bg-gradient-to-b from-[#3e2a31] to-[#1f1419] shadow-[0_26px_40px_rgba(36,22,24,0.35)]" />
                                <div className="absolute left-1/2 top-[-2px] h-16 w-14 -translate-x-1/2 rounded-[16px] border border-[#bcaea6] bg-gradient-to-b from-[#d8cbc3] to-[#af9f95]" />
                                <div className="absolute left-1/2 top-16 h-16 w-24 -translate-x-1/2 rounded-[16px] border border-white/35 bg-white/10" />
                                <div className="absolute bottom-4 right-4 rounded-[16px] bg-[var(--accent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                                    bestseller
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">Быстрый выбор категорий</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {categories.map((category) => (
                        <Link
                            key={category.title}
                            href={category.href}
                            className="group rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:-translate-y-[2px] hover:shadow-[0_16px_30px_rgba(31,23,34,0.08)]"
                        >
                            <div className="font-display text-2xl font-semibold text-[var(--foreground)]">{category.title}</div>
                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{category.description}</p>
                            <span className="mt-4 inline-flex text-sm font-semibold text-[var(--accent)] transition group-hover:translate-x-1">
                                Смотреть →
                            </span>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">Популярные бренды</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                    {brands.map((brand) => (
                        <Link
                            key={brand}
                            href={`/brands/${encodeURIComponent(brand.toLowerCase().replace(/\s+/g, "-"))}`}
                            className="flex min-h-[82px] items-center justify-center rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 text-center text-sm font-semibold text-[#3E3136] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                        >
                            {brand}
                        </Link>
                    ))}
                </div>
            </section>

            <section className="mt-10 rounded-[28px] border border-[var(--accent-soft)] bg-[var(--accent)] p-6 text-white sm:p-8">
                <div className="mb-5">
                    <h2 className="font-display text-3xl font-semibold sm:text-4xl">Акцентная подборка</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {promos.map((promo) => (
                        <Link key={promo.title} href={promo.href} className="rounded-[20px] border border-white/25 bg-white/10 p-5 transition hover:bg-white/15">
                            <div className="font-display text-3xl font-semibold leading-tight">{promo.title}</div>
                            <p className="mt-2 text-sm leading-6 text-white/80">{promo.description}</p>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">Рекомендуемые товары</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {featuredProducts.map((product) => (
                        <ProductCard key={product.id} {...product} />
                    ))}
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">Почему нам доверяют</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {trustItems.map((item) => (
                        <div key={item.title} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
                            <div className="font-display text-2xl font-semibold text-[var(--foreground)]">{item.title}</div>
                            <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{item.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-10 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center">
                    <div>
                        <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">Подбор аромата и консультация</h2>
                        <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                            Если сомневаетесь в выборе, расскажите о предпочтениях, и мы соберём 3-5 вариантов под ваш стиль, бюджет и повод.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href="/contacts" className="inline-flex items-center justify-center rounded-[16px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5C3E69]">
                            Получить консультацию
                        </Link>
                        <Link href="/catalog?sort=hit" className="inline-flex items-center justify-center rounded-[16px] border border-[var(--accent-soft)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[#F5EFF8]">
                            Смотреть хиты
                        </Link>
                    </div>
                </div>
            </section>

            <section className="mt-10 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_10px_25px_rgba(31,23,34,0.06)] sm:p-8">
                <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">О магазине</h2>
                {contentHtml ? (
                    <div className="ProseMirror prose prose-sm mt-4 max-w-none sm:prose-base" dangerouslySetInnerHTML={{ __html: contentHtml }} />
                ) : (
                    <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        Контент главной управляется из админки: раздел `Страницы`, slug `glavnaya`.
                    </p>
                )}
            </section>
        </main>
    );
}
