export const HEADER_PHONE_SHORT_LABEL = "640-88-33";

export const HEADER_PHONE_DROPDOWN_LINKS = [
    { label: "МТС: +375 (33) 640-88-33", href: "tel:+375336408833" },
    { label: "A1: +375 (29) 640-88-33", href: "tel:+375296408833" },
    { label: "life: +375 (25) 640-88-33", href: "tel:+375256408833" },
] as const;

export const HEADER_MESSENGER_LINKS = [
    {
        id: "telegram",
        label: "Telegram",
        appHref: "tg://resolve?domain=perfumer_support",
        webHref: "https://t.me/perfumer_support",
    },
    {
        id: "viber",
        label: "Viber",
        appHref: "viber://chat?number=%2B375296408833",
        webHref: "viber://add?number=375296408833",
    },
] as const;

export const PHONE_NUMBERS = [
    { label: "МТС", number: "+375336408833" },
    { label: "A1", number: "+375296408833" },
    { label: "life", number: "+375256408833" },
] as const;

export const HEADER_CONTACT_LINKS = [
    { label: "Telegram", href: "https://t.me/perfumer_support" },
    { label: "Viber", href: "viber://chat?number=%2B375296408833" },
] as const;

export const HEADER_CATALOG_TRIGGER = {
    label: "Каталог",
    href: "/catalog",
} as const;

export const HEADER_SECONDARY_LINKS = [
    { label: "Новинки", href: "/catalog?sort=new" },
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
