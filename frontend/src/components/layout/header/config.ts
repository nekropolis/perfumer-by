export const HEADER_MAIN_LINKS = [
    { label: "Каталог", href: "/catalog" },
    { label: "Бренды", href: "/brands" },
    { label: "Новинки", href: "/catalog?new=1" },
    { label: "Хиты", href: "/catalog?hit=1" },
] as const;

export const HEADER_CATEGORY_PILLS = [
    { label: "Акции", href: "/catalog?sale=1" },
    { label: "Женские", href: "/catalog?gender=female" },
    { label: "Мужские", href: "/catalog?gender=male" },
    { label: "Унисекс", href: "/catalog?gender=unisex" },
] as const;

export const HEADER_BURGER_LINKS = [
    { label: "Новости", href: "/news" },
    { label: "Статьи", href: "/articles" },
    { label: "Отзывы", href: "/reviews" },
    { label: "Контакты", href: "/contacts" },
] as const;

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
