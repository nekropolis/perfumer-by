import Link from "next/link";
import HomeStoreReviewsSection from "@/components/home/home-store-reviews-section";
import HomeFaqAccordion from "@/components/home/home-faq-accordion";
import { HOME_PAGE_FAQ_ITEMS as faq, type HomePageReviewSnippet } from "@/lib/json-ld";
import { siteBtnPrimary, siteBtnSecondary, siteCard, siteFilterChip, siteFilterChipInactive } from "@/lib/site-ui-classes";

type HomeTemplateProps = {
    heroTitle: string;
    heroDescription: string;
    contentHtml: string;
    storeReviews: HomePageReviewSnippet[];
    popularBrands: { id: number; name: string; slug: string }[];
};

const categories = [
    { title: "Женская парфюмерия", description: "Популярные и нишевые ароматы для неё", href: "/catalog?gender=female" },
    { title: "Мужская парфюмерия", description: "Классические и современные композиции", href: "/catalog?gender=male" },
    { title: "Тестеры и миниатюры", description: "Удобный формат для знакомства с ароматом", href: "/catalog?tester=1&miniature=1" },
    { title: "Наборы", description: "Готовые комплекты ароматов и ухода", href: "/catalog?set=1" },
];

const promos = [
    { title: "Сезонная подборка", description: "Тёплые шлейфовые композиции для вечера и прохладных дней.", href: "/catalog?sale=1" },
    { title: "Новые поступления", description: "Свежие релизы брендов, которые уже доступны в каталоге.", href: "/catalog?new=1" },
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
    { title: "Женские духи", href: "/catalog?gender=female" },
    { title: "Мужские духи", href: "/catalog?gender=male" },
    { title: "Тестеры духов", href: "/catalog?tester=1&miniature=1" },
    { title: "Парфюмерия со скидкой", href: "/catalog?sale=1" },
];

function FeaturedProductCard({
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
        <div className={`${siteCard} group cursor-pointer p-4 transition hover:-translate-y-0.5 hover:border-admin-border-strong hover:shadow-md`}>
            <div className="mb-4 aspect-square rounded-lg bg-admin-muted" />
            <div className="mb-1 text-sm text-admin-text-secondary">{brand}</div>
            <div className="line-clamp-2 min-h-[48px] text-base font-medium leading-6 text-admin-text">{name}</div>
            <div className="mt-4 flex items-end gap-2">
                <div className="text-lg font-semibold text-admin-text">{price} BYN</div>
                {oldPrice ? <div className="text-sm text-admin-text-secondary line-through">{oldPrice} BYN</div> : null}
            </div>
        </div>
    );
}

export default function HomeTemplate({
    heroTitle,
    heroDescription,
    contentHtml,
    storeReviews,
    popularBrands,
}: HomeTemplateProps) {
    return (
        <>
            <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-8">
                <section className={`${siteCard} relative overflow-hidden px-5 py-7 md:px-8 md:py-9`}>
                    <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
                        <div className="order-1 md:min-w-0 md:flex-[1.28]">
                            <div className="mb-4 inline-flex rounded-full border border-admin-border bg-admin-muted px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                                Оригинальная парфюмерия
                            </div>

                            <h1 className="max-w-[20ch] text-3xl font-semibold leading-tight tracking-tight text-admin-text sm:text-4xl md:text-5xl">
                                {heroTitle}
                            </h1>

                            <p className="mt-4 max-w-[44ch] text-sm leading-7 text-admin-text-secondary sm:text-base">
                                {heroDescription}
                            </p>

                            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-admin-text-secondary">
                                <span>100% оригинал</span>
                                <span className="text-admin-border-strong">·</span>
                                <span>Доставка по Беларуси</span>
                                <span className="text-admin-border-strong">·</span>
                                <span>Консультация эксперта</span>
                            </div>

                            <div className="mt-7 flex flex-wrap gap-3">
                                <Link href="/catalog" className={siteBtnPrimary}>
                                    Смотреть каталог
                                </Link>
                                <Link href="/brands" className={siteBtnSecondary}>
                                    Популярные бренды
                                </Link>
                            </div>
                        </div>

                        <div className="order-2 relative mx-auto w-full max-w-[320px] md:mx-0 md:ml-auto md:flex-[0.72]">
                            <div className="rounded-xl border border-admin-border bg-admin-muted p-6">
                                <div className="flex aspect-[4/5] items-center justify-center rounded-lg bg-admin-surface text-center">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-admin-text-secondary">
                                            Perfumer
                                        </div>
                                        <div className="mt-2 font-display text-2xl text-admin-text">Ароматы</div>
                                        <div className="mt-1 text-sm text-admin-text-secondary">для вашего стиля</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        Быстрый выбор категорий
                    </h2>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {categories.map((category) => (
                            <Link
                                key={category.title}
                                href={category.href}
                                className={`${siteCard} group p-5 transition hover:-translate-y-0.5 hover:border-admin-border-strong hover:shadow-md`}
                            >
                                <div className="text-lg font-semibold text-admin-text sm:text-xl">
                                    {category.title}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-admin-text-secondary">
                                    {category.description}
                                </p>
                                <span className="mt-4 inline-flex text-sm font-semibold text-admin-primary transition group-hover:translate-x-0.5">
                                    Смотреть →
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>

                {popularBrands.length > 0 ? (
                    <section className="mt-10">
                        <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                            Популярные бренды
                        </h2>

                        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                            {popularBrands.map((brand) => (
                                <Link
                                    key={brand.id}
                                    href={`/brands/${encodeURIComponent(brand.slug)}`}
                                    className={`${siteCard} flex min-h-[72px] items-center justify-center px-4 text-center text-sm font-semibold text-admin-text transition hover:border-admin-border-strong hover:bg-admin-muted`}
                                >
                                    {brand.name}
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}

                <section className={`${siteCard} relative mt-10 overflow-hidden p-6 sm:p-8`}>
                    <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        Акцентная подборка
                    </h2>

                    <div className="relative mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                        {promos.map((promo) => (
                            <Link
                                key={promo.title}
                                href={promo.href}
                                className="group rounded-xl border border-admin-border bg-admin-muted/40 p-5 transition hover:border-admin-border-strong hover:bg-admin-muted"
                            >
                                <div className="text-xl font-semibold leading-tight text-admin-text sm:text-2xl">
                                    {promo.title}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-admin-text-secondary">
                                    {promo.description}
                                </p>
                                <span className="mt-4 inline-flex text-sm font-semibold text-admin-primary transition group-hover:translate-x-0.5">
                                    Смотреть →
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        Рекомендуемые товары
                    </h2>

                    <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {featuredProducts.map((product) => (
                            <FeaturedProductCard key={product.id} {...product} />
                        ))}
                    </div>
                </section>

                <section className={`${siteCard} mt-10 p-6 sm:p-8`}>
                    <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        Интернет-магазин оригинальной парфюмерии
                    </h2>

                    <div className="mt-4 space-y-4 text-sm leading-7 text-admin-text-secondary sm:text-base">
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
                    <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        Почему нам доверяют
                    </h2>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                        {trustItems.map((item) => (
                            <div key={item.title} className={`${siteCard} p-5`}>
                                <div className="text-lg font-semibold text-admin-text sm:text-xl">
                                    {item.title}
                                </div>
                                <p className="mt-2 text-sm leading-7 text-admin-text-secondary">
                                    {item.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <HomeStoreReviewsSection storeReviews={storeReviews} />

                <section className={`${siteCard} mt-10 p-6 sm:p-8`}>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center">
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                                Подбор аромата и консультация
                            </h2>
                            <p className="mt-3 text-sm leading-7 text-admin-text-secondary">
                                Если сомневаетесь в выборе, расскажите о предпочтениях, и мы соберём 3-5 вариантов под ваш стиль, бюджет и повод.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link href="/contacts" className={siteBtnPrimary}>
                                Получить консультацию
                            </Link>
                            <Link href="/catalog?sort=hit" className={siteBtnSecondary}>
                                Смотреть хиты
                            </Link>
                        </div>
                    </div>
                </section>

                <HomeFaqAccordion items={faq} />

                <section className="mt-10">
                    <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        Популярные запросы
                    </h2>

                    <div className="mt-5 flex flex-wrap gap-2">
                        {popularSearches.map((item) => (
                            <Link
                                key={item.title}
                                href={item.href}
                                className={`${siteFilterChip} ${siteFilterChipInactive}`}
                            >
                                {item.title}
                            </Link>
                        ))}
                    </div>
                </section>

                <section className={`${siteCard} mt-10 p-6 sm:p-8`}>
                    <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                        О магазине
                    </h2>

                    {contentHtml ? (
                        <div
                            className="ProseMirror prose prose-sm mt-4 max-w-none sm:prose-base"
                            dangerouslySetInnerHTML={{ __html: contentHtml }}
                        />
                    ) : (
                        <p className="mt-3 text-sm leading-7 text-admin-text-secondary">
                            Контент главной управляется из админки: раздел `Страницы`, slug `glavnaya`.
                        </p>
                    )}
                </section>
            </main>
        </>
    );
}