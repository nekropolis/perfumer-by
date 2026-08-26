import Image from "next/image";
import Link from "next/link";
import HomeStoreReviewsSection from "@/components/home/home-store-reviews-section";
import HomeFaqAccordion from "@/components/home/home-faq-accordion";
import ProductCardImage from "@/components/product/product-card-image";
import SimilarProductsCarousel from "@/components/product/similar-products-carousel";
import { HOME_PAGE_FAQ_ITEMS as faq, type HomePageReviewSnippet } from "@/lib/json-ld";
import { productDisplayName } from "@/lib/product-display-name";
import { SIMILAR_PRODUCTS_MIN_TO_SHOW } from "@/lib/product-detail-utils";
import { siteBtnPrimary, siteBtnSecondary, siteCard, siteFilterChip, siteFilterChipInactive } from "@/lib/site-ui-classes";
import type { ProductListItem } from "@/types/catalog";

type HomeTemplateProps = {
    heroTitle: string;
    heroDescription: string;
    contentHtml: string;
    storeReviews: HomePageReviewSnippet[];
    popularBrands: { id: number; name: string; slug: string }[];
    recommendedProducts: ProductListItem[];
    heroProduct: ProductListItem | null;
};

const categories = [
    {
        title: "Женская парфюмерия",
        description: "Популярные и нишевые ароматы для неё",
        href: "/catalog?gender=female",
        image: "/home/categories/category-female.webp",
        imageClassName: "object-right",
    },
    {
        title: "Мужская парфюмерия",
        description: "Классические и современные композиции",
        href: "/catalog?gender=male",
        image: "/home/categories/category-male.webp",
        imageClassName: "object-right",
    },
    {
        title: "Тестеры и миниатюры",
        description: "Удобный формат для знакомства с ароматом",
        href: "/catalog?tester=1&miniature=1",
        image: "/home/categories/category-testers.webp",
        imageClassName: "object-right scale-125 translate-x-[22%]",
    },
    {
        title: "Наборы",
        description: "Готовые комплекты ароматов и ухода",
        href: "/catalog?set=1",
        image: "/home/categories/category-sets.webp",
        imageClassName: "object-right",
    },
];

const promos = [
    {
        title: "Сезонная подборка",
        description: "Тёплые шлейфовые композиции для вечера и прохладных дней.",
        href: "/catalog?sale=1",
        image: "/home/promos/promo-seasonal.webp",
    },
    {
        title: "Новые поступления",
        description: "Свежие релизы брендов, которые уже доступны в каталоге.",
        href: "/catalog?new=1",
        image: "/home/promos/promo-new.webp",
    },
];

const trustItems = [
    { title: "Оригинальная продукция", description: "Поставки от официальных дистрибьюторов и проверенных партнёров." },
    { title: "Бережная упаковка", description: "Каждый заказ собирается вручную и защищается для доставки." },
    { title: "Консультация эксперта", description: "Подбираем аромат по сезону, случаю и личным предпочтениям." },
    { title: "Быстрая доставка", description: "По Минску и по всей Беларуси в удобные для клиента интервалы." },
];

const heroPickFrame =
    "rounded-xl border border-white/70 bg-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-[#c9a45c]/40 backdrop-blur-md";

const popularSearches = [
    { title: "Купить духи в Минске", href: "/catalog?attr_18=699" },
    { title: "Наборы", href: "/catalog?set=1" },
    { title: "Женские духи", href: "/catalog?gender=female" },
    { title: "Мужские духи", href: "/catalog?gender=male" },
    { title: "Тестеры духов", href: "/catalog?tester=1&miniature=1" },
    { title: "Парфюмерия со скидкой", href: "/catalog?sale=1" },
];

export default function HomeTemplate({
    heroTitle,
    heroDescription,
    contentHtml,
    storeReviews,
    popularBrands,
    recommendedProducts,
    heroProduct,
}: HomeTemplateProps) {
    const heroProductName = heroProduct ? productDisplayName(heroProduct) : null;
    const heroProductHref = heroProduct
        ? heroProduct.listing_variant_id
            ? `/${heroProduct.slug}?variant=${heroProduct.listing_variant_id}`
            : `/${heroProduct.slug}`
        : null;

    return (
        <>
            <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-8">
                <section className={`${siteCard} relative overflow-hidden px-5 py-7 md:px-8 md:py-9`}>
                    <Image
                        src="/home/hero-perfume-v2.webp"
                        alt=""
                        fill
                        priority
                        unoptimized
                        sizes="(max-width: 1280px) 100vw, 1280px"
                        className="object-cover object-[75%_40%]"
                        aria-hidden
                    />
                    <div
                        className="absolute inset-0 bg-gradient-to-r from-admin-surface from-5% via-admin-surface/75 to-transparent"
                        aria-hidden
                    />

                    <div className="relative z-[1] flex flex-col gap-6 md:flex-row md:items-stretch md:gap-8">
                        <div className="order-1 md:min-w-0 md:flex-1">
                            <div className="mb-4 inline-flex rounded-full border border-admin-border bg-admin-muted/90 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
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

                        <div className="order-2 w-full max-w-[280px] shrink-0 md:ml-auto md:w-[280px] md:max-w-none">
                            {heroProduct && heroProductHref ? (
                                <Link
                                    href={heroProductHref}
                                    className={`group flex h-full min-h-[280px] flex-col overflow-hidden ${heroPickFrame} transition hover:bg-white/65 hover:ring-[#c9a45c]/70 md:min-h-0`}
                                >
                                    <div className="flex items-center gap-2 px-4 pt-3.5">
                                        <span className="h-px w-3.5 bg-[#c9a45c]" aria-hidden />
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-admin-text-secondary">
                                            Выбор покупателей
                                        </span>
                                    </div>
                                    <div className="relative min-h-[180px] flex-1 md:min-h-0">
                                        <div className="absolute inset-x-4 inset-y-1">
                                            <ProductCardImage
                                                imagePath={heroProduct.image}
                                                alt={heroProductName ?? ""}
                                                eager
                                            />
                                        </div>
                                    </div>
                                    <div className="shrink-0 px-4 pb-4 pt-1">
                                        {heroProduct.brand?.name ? (
                                            <div className="text-xs font-medium uppercase tracking-[0.08em] text-admin-text-secondary">
                                                {heroProduct.brand.name}
                                            </div>
                                        ) : null}
                                        <div className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-admin-text">
                                            {heroProductName}
                                        </div>
                                        <span className="mt-2 inline-flex text-sm font-semibold text-admin-primary transition group-hover:translate-x-0.5">
                                            Смотреть →
                                        </span>
                                    </div>
                                </Link>
                            ) : (
                                <div className={`flex h-full min-h-[220px] items-center justify-center ${heroPickFrame} px-5 py-6 text-center md:min-h-0`}>
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-admin-text-secondary">
                                            Perfumer
                                        </div>
                                        <div className="mt-2 font-display text-2xl text-admin-text">Ароматы</div>
                                        <div className="mt-1 text-sm text-admin-text-secondary">для вашего стиля</div>
                                    </div>
                                </div>
                            )}
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
                                className={`${siteCard} group relative flex min-h-[168px] overflow-hidden transition hover:-translate-y-0.5 hover:border-admin-border-strong hover:shadow-md`}
                            >
                                <Image
                                    src={category.image}
                                    alt=""
                                    fill
                                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                                    className={`object-cover ${category.imageClassName}`}
                                    aria-hidden
                                />
                                <div
                                    className="absolute inset-y-0 left-0 w-[76%] bg-gradient-to-r from-admin-surface from-50% via-admin-surface/94 to-transparent"
                                    aria-hidden
                                />
                                <div className="relative z-[1] flex w-[58%] min-w-0 flex-col p-5 pr-2">
                                    <div className="text-lg font-semibold text-admin-text sm:text-xl">
                                        {category.title}
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-admin-text-secondary">
                                        {category.description}
                                    </p>
                                    <span className="mt-auto inline-flex pt-4 text-sm font-semibold text-admin-primary transition group-hover:translate-x-0.5">
                                        Смотреть →
                                    </span>
                                </div>
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
                                className="group relative flex min-h-[168px] overflow-hidden rounded-xl border border-admin-border transition hover:-translate-y-0.5 hover:border-admin-border-strong hover:shadow-md"
                            >
                                <Image
                                    src={promo.image}
                                    alt=""
                                    fill
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                    className={`object-cover object-right`}
                                    aria-hidden
                                />
                                <div
                                    className="absolute inset-0 bg-gradient-to-r from-admin-surface from-55% via-admin-surface/5 to-transparent"
                                    aria-hidden
                                />
                                <div className="relative z-[1] flex w-[62%] min-w-0 flex-col p-5">
                                    <div className="text-xl font-semibold leading-tight text-admin-text sm:text-2xl">
                                        {promo.title}
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-admin-text-secondary">
                                        {promo.description}
                                    </p>
                                    <span className="mt-auto inline-flex pt-4 text-sm font-semibold text-admin-primary transition group-hover:translate-x-0.5">
                                        Смотреть →
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {recommendedProducts.length >= SIMILAR_PRODUCTS_MIN_TO_SHOW ? (
                    <SimilarProductsCarousel products={recommendedProducts} title="Рекомендуемые товары" />
                ) : null}

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