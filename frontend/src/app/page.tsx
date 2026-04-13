import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Perfumer — интернет-магазин парфюмерии",
    description:
        "Интернет-магазин парфюмерии и косметики. Оригинальные ароматы, доставка по Минску и Беларуси, удобная оплата и выгодные предложения.",
};

const categories = [
    {
        title: "Женская парфюмерия",
        description: "Популярные и нишевые ароматы для неё",
        href: "/catalog?category=women",
    },
    {
        title: "Мужская парфюмерия",
        description: "Классические и современные композиции",
        href: "/catalog?category=men",
    },
    {
        title: "Тестеры и миниатюры",
        description: "Удобный формат для знакомства с ароматом",
        href: "/catalog?type=testers",
    },
];

const promos = [
    {
        title: "Скидки до 30%",
        description: "На избранные ароматы этой недели",
        href: "/catalog?sale=1",
    },
    {
        title: "Новинки каталога",
        description: "Недавно добавленные товары",
        href: "/catalog?sort=new",
    },
    {
        title: "Хиты продаж",
        description: "Самые популярные позиции магазина",
        href: "/catalog?sort=hit",
    },
];

const featuredProducts = [
    {
        id: 1,
        name: "Tom Ford Lost Cherry",
        brand: "Tom Ford",
        price: "420.00",
        oldPrice: "480.00",
        href: "/product/tom-ford-lost-cherry",
    },
    {
        id: 2,
        name: "Maison Francis Kurkdjian Baccarat Rouge 540",
        brand: "MFK",
        price: "560.00",
        oldPrice: null,
        href: "/product/baccarat-rouge-540",
    },
    {
        id: 3,
        name: "Initio Oud for Greatness",
        brand: "Initio",
        price: "510.00",
        oldPrice: "590.00",
        href: "/product/initio-oud-for-greatness",
    },
    {
        id: 4,
        name: "Xerjoff Erba Pura",
        brand: "Xerjoff",
        price: "390.00",
        oldPrice: null,
        href: "/product/xerjoff-erba-pura",
    },
];

const benefits = [
    {
        title: "Оригинальная продукция",
        description: "Работаем только с проверенными поставщиками и актуальными предложениями.",
    },
    {
        title: "Доставка по Беларуси",
        description: "Курьером, Белпочтой и Европочтой — выбирайте удобный способ получения.",
    },
    {
        title: "Удобная оплата",
        description: "Наличными, наложенным платежом или банковской картой онлайн.",
    },
    {
        title: "Помощь с выбором",
        description: "Подскажем по ароматам, концентрации, объёму и подходящему варианту.",
    },
];

function ProductCard({
                         name,
                         brand,
                         price,
                         oldPrice,
                         href,
                     }: {
    name: string;
    brand: string;
    price: string;
    oldPrice: string | null;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="group rounded-3xl border bg-white p-4 transition hover:-translate-y-[1px] hover:shadow-sm"
        >
            <div className="mb-4 aspect-[4/5] rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100" />

            <div className="mb-1 text-sm text-gray-500">{brand}</div>
            <div className="line-clamp-2 min-h-[48px] text-base font-medium leading-6">
                {name}
            </div>

            <div className="mt-4 flex items-end gap-2">
                <div className="text-lg font-semibold">{price} руб.</div>
                {oldPrice && (
                    <div className="text-sm text-gray-400 line-through">{oldPrice} руб.</div>
                )}
            </div>
        </Link>
    );
}

export default function HomePage() {
    return (
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[28px] bg-black px-6 py-8 text-white sm:px-8 sm:py-10">
                    <div className="mb-3 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs text-white/80">
                        Оригинальная парфюмерия
                    </div>

                    <h1 className="max-w-[14ch] text-4xl font-semibold leading-tight sm:text-5xl">
                        Ароматы, которые хочется носить каждый день
                    </h1>

                    <p className="mt-4 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
                        Интернет-магазин парфюмерии с доставкой по Минску и всей Беларуси.
                        Подбирайте ароматы по бренду, объёму, концентрации и цене.
                    </p>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <Link
                            href="/catalog"
                            className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:opacity-90"
                        >
                            Перейти в каталог
                        </Link>

                        <Link
                            href="/catalog?sale=1"
                            className="inline-flex items-center justify-center rounded-2xl border border-white/20 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/5"
                        >
                            Смотреть акции
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-[28px] border bg-white p-6">
                        <div className="mb-2 text-sm text-gray-500">Быстрая доставка</div>
                        <div className="text-2xl font-semibold leading-tight">
                            Минск, Беларусь, почта и курьер
                        </div>
                        <p className="mt-3 text-sm leading-6 text-gray-600">
                            Белпочта, Европочта, курьерская доставка по РБ и удобная оплата.
                        </p>
                    </div>

                    <div className="rounded-[28px] border bg-white p-6">
                        <div className="mb-2 text-sm text-gray-500">Нужна помощь?</div>
                        <div className="text-2xl font-semibold leading-tight">
                            Поможем подобрать аромат
                        </div>
                        <p className="mt-3 text-sm leading-6 text-gray-600">
                            Подскажем по концентрации, объёму, стойкости и подходящему случаю.
                        </p>
                    </div>
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold">Популярные категории</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Начните с самого востребованного
                        </p>
                    </div>

                    <Link href="/catalog" className="text-sm text-gray-600 underline underline-offset-4">
                        Весь каталог
                    </Link>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {categories.map((category) => (
                        <Link
                            key={category.title}
                            href={category.href}
                            className="rounded-3xl border bg-white p-6 transition hover:-translate-y-[1px] hover:shadow-sm"
                        >
                            <div className="text-xl font-semibold">{category.title}</div>
                            <p className="mt-2 text-sm leading-6 text-gray-600">
                                {category.description}
                            </p>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold">Акции и подборки</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Подсветим важное прямо на главной
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {promos.map((promo, index) => (
                        <Link
                            key={promo.title}
                            href={promo.href}
                            className={`rounded-3xl px-6 py-7 transition hover:-translate-y-[1px] hover:shadow-sm ${
                                index === 0
                                    ? "bg-black text-white"
                                    : "border bg-white text-black"
                            }`}
                        >
                            <div className={`text-2xl font-semibold ${index === 0 ? "text-white" : ""}`}>
                                {promo.title}
                            </div>
                            <p
                                className={`mt-2 text-sm leading-6 ${
                                    index === 0 ? "text-white/75" : "text-gray-600"
                                }`}
                            >
                                {promo.description}
                            </p>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold">Рекомендуем</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Хиты, новинки и позиции, которые хорошо смотрятся на главной
                        </p>
                    </div>

                    <Link href="/catalog?sort=hit" className="text-sm text-gray-600 underline underline-offset-4">
                        Смотреть больше
                    </Link>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {featuredProducts.map((product) => (
                        <ProductCard key={product.id} {...product} />
                    ))}
                </div>
            </section>

            <section className="mt-10 rounded-[28px] bg-gray-50 p-6 sm:p-8">
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold">Почему выбирают нас</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        То, что важно клиенту перед покупкой
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {benefits.map((item) => (
                        <div key={item.title} className="rounded-3xl bg-white p-5">
                            <div className="text-lg font-semibold">{item.title}</div>
                            <p className="mt-2 text-sm leading-6 text-gray-600">
                                {item.description}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
                <div className="rounded-3xl border bg-white p-6 sm:p-8">
                    <h2 className="text-2xl font-semibold">Интернет-магазин парфюмерии в Беларуси</h2>
                    <div className="mt-4 max-w-4xl text-sm leading-7 text-gray-600">
                        <p>
                            Perfumer — это интернет-магазин парфюмерии, где можно выбрать
                            оригинальные ароматы для себя или в подарок. В каталоге удобно
                            искать товары по бренду, категории, цене и популярности.
                        </p>
                        <p className="mt-3">
                            Мы постепенно развиваем каталог, карточки товаров, акции и подборки,
                            чтобы главная страница помогала быстро перейти к нужному разделу,
                            а не просто была пустой витриной. Такой блок полезен и для
                            пользователя, и для SEO.
                        </p>
                    </div>
                </div>

                <div className="rounded-3xl border bg-white p-6">
                    <div className="mb-2 text-sm text-gray-500">Связаться с нами</div>
                    <div className="text-2xl font-semibold">Поможем с выбором</div>
                    <p className="mt-3 text-sm leading-6 text-gray-600">
                        Можно начать с каталога, акций или популярных категорий, а дальше
                        уже постепенно наполнить главную реальными товарами и баннерами из админки.
                    </p>

                    <div className="mt-5">
                        <Link
                            href="/catalog"
                            className="inline-flex items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-95"
                        >
                            Открыть каталог
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    );
}