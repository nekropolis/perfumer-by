import Link from "next/link";
import HomeStoreReviewsSection from "@/components/home/home-store-reviews-section";
import { HOME_PAGE_FAQ_ITEMS as faq, type HomePageReviewSnippet } from "@/lib/json-ld";

type HomeTemplateProps = {
    heroTitle: string;
    heroDescription: string;
    contentHtml: string;
    storeReviews: HomePageReviewSnippet[];
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

const popularSearches = [
    { title: "Купить духи в Минске", href: "/catalog" },
    { title: "Нишевая парфюмерия", href: "/catalog?collection=niche" },
    { title: "Женские духи", href: "/catalog?category=women" },
    { title: "Мужские духи", href: "/catalog?category=men" },
    { title: "Тестеры духов", href: "/catalog?type=testers" },
    { title: "Парфюмерия со скидкой", href: "/catalog?sale=1" },
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
        <div className="group rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:-translate-y-[2px] hover:border-[var(--accent-soft)] hover:shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="mb-4 aspect-[4/5] rounded-[20px] bg-[var(--image-plate)] bg-gradient-to-b from-[#F8F4ED] to-[#ECE3D6]" />
            <div className="mb-1 text-sm text-[var(--text-secondary)]">{brand}</div>
            <div className="line-clamp-2 min-h-[48px] text-base font-medium leading-6 text-[var(--foreground)]">{name}</div>
            <div className="mt-4 flex items-end gap-2">
                <div className="text-lg font-semibold text-[var(--foreground)]">{price} руб.</div>
                {oldPrice ? <div className="text-sm text-[var(--text-secondary)] line-through">{oldPrice} руб.</div> : null}
            </div>
        </div>
    );
}

export default function HomeTemplate({ heroTitle, heroDescription, contentHtml, storeReviews }: HomeTemplateProps) {
    return (
        <>
            <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-8">
                <section className="relative overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] px-5 py-7 md:px-8 md:py-9">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_85%_0%,rgba(201,164,92,0.12),transparent_55%)]" />
                    <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
                        <div className="order-1 md:min-w-0 md:flex-[1.28]">
                            <div className="mb-4 inline-flex rounded-full border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-3 py-1 text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
                                Dark Luxury Editorial
                            </div>

                            <h1 className="font-display max-w-[19ch] text-5xl leading-[0.95] text-[var(--foreground)] sm:text-6xl">
                                {heroTitle}
                            </h1>

                            <p className="mt-4 max-w-[44ch] text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                                {heroDescription}
                            </p>

                            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]">
                                <span className="text-[var(--accent)]">✦ <span className="text-[var(--text-secondary)]">100% оригинал</span></span>
                                <span className="text-[var(--accent)]">✦ <span className="text-[var(--text-secondary)]">Доставка по Беларуси</span></span>
                                <span className="text-[var(--accent)]">✦ <span className="text-[var(--text-secondary)]">Консультация эксперта</span></span>
                            </div>

                            <div className="mt-7 flex flex-wrap gap-3">
                                <Link href="/catalog" className="inline-flex items-center justify-center rounded-[16px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)]">
                                    Смотреть каталог
                                </Link>
                                <Link href="/brands" className="inline-flex items-center justify-center rounded-[16px] border border-[var(--accent-soft)] bg-transparent px-5 py-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]">
                                    Популярные бренды
                                </Link>
                            </div>
                        </div>

                        <div className="order-2 relative mx-auto w-full max-w-[360px] md:mx-0 md:ml-auto md:flex-[0.72]">
                            <div className="rounded-[28px] border border-[var(--accent-soft)] bg-[var(--image-plate)] bg-gradient-to-b from-[#F8F4ED] to-[#E9DECF] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
                                <div className="relative h-72">
                                    <div className="absolute left-1/2 top-5 h-56 w-36 -translate-x-1/2 rounded-[28px] border border-[#C9A45C]/40 bg-gradient-to-b from-[#2a2320] to-[#14110F] shadow-[0_26px_40px_rgba(0,0,0,0.4)]" />
                                    <div className="absolute left-1/2 top-[-2px] h-16 w-14 -translate-x-1/2 rounded-[16px] border border-[#C9A45C]/60 bg-gradient-to-b from-[#E4C786] to-[#C9A45C]" />
                                    <div className="absolute left-1/2 top-16 h-16 w-24 -translate-x-1/2 rounded-[16px] border border-[#C9A45C]/40 bg-white/30" />
                                    <div className="absolute bottom-4 right-4 rounded-[16px] bg-[var(--accent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--background)]">
                                        bestseller
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                        Быстрый выбор категорий
                    </h2>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {categories.map((category) => (
                            <Link
                                key={category.title}
                                href={category.href}
                                className="group rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:-translate-y-[2px] hover:shadow-[0_16px_30px_rgba(31,23,34,0.08)]"
                            >
                                <div className="font-display text-2xl font-semibold text-[var(--foreground)]">
                                    {category.title}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                    {category.description}
                                </p>
                                <span className="mt-4 inline-flex text-sm font-semibold text-[var(--accent)] transition group-hover:translate-x-1">
                                    Смотреть →
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                        Популярные бренды
                    </h2>

                    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                        {brands.map((brand) => (
                            <Link
                                key={brand}
                                href={`/brands/${encodeURIComponent(brand.toLowerCase().replace(/\s+/g, "-"))}`}
                                className="flex min-h-[82px] items-center justify-center rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 text-center text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                            >
                                {brand}
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="relative mt-10 overflow-hidden rounded-[28px] border border-[var(--accent-soft)] bg-[var(--surface)] p-6 sm:p-8">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_130%_at_0%_0%,var(--accent-soft),transparent_55%)]" />
                    <h2 className="relative font-display text-3xl font-semibold text-[var(--accent)] sm:text-4xl">
                        Акцентная подборка
                    </h2>

                    <div className="relative mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                        {promos.map((promo) => (
                            <Link
                                key={promo.title}
                                href={promo.href}
                                className="rounded-[20px] border border-[var(--line)] bg-[var(--background)] p-5 transition hover:border-[var(--accent-soft)] hover:bg-[var(--surface-2)]"
                            >
                                <div className="font-display text-3xl font-semibold leading-tight text-[var(--foreground)]">
                                    {promo.title}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                    {promo.description}
                                </p>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                        Рекомендуемые товары
                    </h2>

                    <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {featuredProducts.map((product) => (
                            <ProductCard key={product.id} {...product} />
                        ))}
                    </div>
                </section>

                <section className="mt-10 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                        Интернет-магазин оригинальной парфюмерии
                    </h2>

                    <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                        <p>
                            В нашем интернет-магазине вы можете купить оригинальную парфюмерию для женщин и мужчин:
                            популярные ароматы, нишевые композиции, тестеры, миниатюры и лимитированные релизы.
                        </p>
                        <p>
                            Мы подбираем ассортимент с акцентом на качество, стойкость и актуальность ароматов.
                            В каталоге представлены люксовые и нишевые бренды, а также сезонные подборки для разных
                            случаев: на каждый день, для вечера, подарка или особого события.
                        </p>
                        <p>
                            Заказы доставляются по Минску и всей Беларуси. Если вы сомневаетесь в выборе, мы поможем
                            подобрать аромат под ваш стиль, бюджет и предпочтения.
                        </p>
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                        Почему нам доверяют
                    </h2>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                        {trustItems.map((item) => (
                            <div key={item.title} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
                                <div className="font-display text-2xl font-semibold text-[var(--foreground)]">
                                    {item.title}
                                </div>
                                <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                                    {item.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <HomeStoreReviewsSection storeReviews={storeReviews} />

                <section className="mt-10 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center">
                        <div>
                            <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                                Подбор аромата и консультация
                            </h2>
                            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                                Если сомневаетесь в выборе, расскажите о предпочтениях, и мы соберём 3-5 вариантов под ваш стиль, бюджет и повод.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link href="/contacts" className="inline-flex items-center justify-center rounded-[16px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)]">
                                Получить консультацию
                            </Link>
                            <Link href="/catalog?sort=hit" className="inline-flex items-center justify-center rounded-[16px] border border-[var(--accent-soft)] bg-transparent px-5 py-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]">
                                Смотреть хиты
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                        Вопросы и ответы
                    </h2>

                    <div className="mt-5 space-y-4">
                        {faq.map((item) => (
                            <div
                                key={item.question}
                                className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"
                            >
                                <h3 className="text-base font-semibold text-[var(--foreground)]">
                                    {item.question}
                                </h3>
                                <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                                    {item.answer}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                        Популярные запросы
                    </h2>

                    <div className="mt-5 flex flex-wrap gap-3">
                        {popularSearches.map((item) => (
                            <Link
                                key={item.title}
                                href={item.href}
                                className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                            >
                                {item.title}
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="mt-10 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_10px_25px_rgba(31,23,34,0.06)] sm:p-8">
                    <h2 className="font-display text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                        О магазине
                    </h2>

                    {contentHtml ? (
                        <div
                            className="ProseMirror prose prose-sm mt-4 max-w-none sm:prose-base"
                            dangerouslySetInnerHTML={{ __html: contentHtml }}
                        />
                    ) : (
                        <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                            Контент главной управляется из админки: раздел `Страницы`, slug `glavnaya`.
                        </p>
                    )}
                </section>
            </main>
        </>
    );
}