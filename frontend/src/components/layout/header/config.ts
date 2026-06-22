export const HEADER_CATALOG_TRIGGER = {
    label: "Каталог",
    href: "/catalog",
} as const;

export const HEADER_SECONDARY_LINKS = [
    { label: "Новинки", href: "/catalog?new=1" },
    { label: "Хиты", href: "/catalog?hit=1" },
    { label: "Акции", href: "/catalog?sale=1" },
    { label: "Бренды", href: "/brands" },
    { label: "Новости", href: "/news" },
    { label: "Статьи", href: "/articles" },
    { label: "Отзывы", href: "/reviews" },
    { label: "Контакты", href: "/contacts" },
] as const;

export const HEADER_CATALOG_DRAWER_SECTIONS = [
    {
        title: "По категориям",
        links: [
            { label: "Весь каталог", href: "/catalog" },
            { label: "Женские ароматы", href: "/catalog?gender=female" },
            { label: "Мужские ароматы", href: "/catalog?gender=male" },
            { label: "Унисекс", href: "/catalog?gender=unisex" },
            { label: "Миниатюры и пробники", href: "/catalog?type=samples" },
        ],
    },
    {
        title: "Популярные бренды",
        links: [
            { label: "Все бренды", href: "/brands" },
            { label: "Tom Ford", href: "/brands/tom-ford" },
            { label: "Chanel", href: "/brands/chanel" },
            { label: "Dior", href: "/brands/dior" },
            { label: "Mancera", href: "/brands/mancera" },
        ],
    },
];

export const HEADER_POPULAR_SEARCHES = [
    "Tom Ford",
    "Dior",
    "Mancera",
    "Chanel",
    "Montale",
    "Versace",
    "Gucci",
    "Kilian",
] as const;
