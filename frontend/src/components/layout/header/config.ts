export const HEADER_PROMO_TEXT = "Бесплатная доставка по Минску от 150 BYN";

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

export const HEADER_CONTACT_LINKS = [
    { label: "640-88-33 (МТС / A1 / life)", href: "tel:+375296408833" },
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
            { label: "Tom Ford", href: "/catalog?brand_slug=tom-ford" },
            { label: "Chanel", href: "/catalog?brand_slug=chanel" },
            { label: "Dior", href: "/catalog?brand_slug=dior" },
            { label: "Mancera", href: "/catalog?brand_slug=mancera" },
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
