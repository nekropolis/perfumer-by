/**
 * Публичные юр. URL витрины (CMS-страницы /admin/pages).
 * Контент заполняется вручную; slug должны совпадать.
 */
export const LEGAL_PAGE_PATHS = {
    offer: "/publichnaya-oferta",
    privacy: "/politika-obrabotki-personalnyh-dannyh",
    cookies: "/politika-cookies",
    delivery: "/dostavka",
    returns: "/vozvrat-i-obmen",
} as const;

export type LegalPageKey = keyof typeof LEGAL_PAGE_PATHS;

export const LEGAL_FOOTER_LINKS: { label: string; href: string }[] = [
    { label: "Публичная оферта", href: LEGAL_PAGE_PATHS.offer },
    { label: "Политика ПДн", href: LEGAL_PAGE_PATHS.privacy },
    { label: "Политика cookies", href: LEGAL_PAGE_PATHS.cookies },
    { label: "Доставка", href: LEGAL_PAGE_PATHS.delivery },
    { label: "Возврат и обмен", href: LEGAL_PAGE_PATHS.returns },
];
