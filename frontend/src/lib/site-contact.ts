import type { SiteContent } from "@/lib/site-content-api";

function digitsOnly(s: string): string {
    return s.replace(/\D/g, "");
}

/** `tel:` для белорусского номера в формате хранения в админке. */
export function telHref(e164: string): string {
    const d = digitsOnly(e164);
    if (!d) {
        return "";
    }
    return `tel:+${d}`;
}

/** Отображение вида +375 (33) 640-88-33 */
export function formatBelarusDisplay(e164: string): string {
    const d = digitsOnly(e164);
    if (d.length === 12 && d.startsWith("375")) {
        const op = d.slice(3, 5);
        const p = d.slice(5);
        return `+375 (${op}) ${p.slice(0, 3)}-${p.slice(3, 5)}-${p.slice(5)}`;
    }
    return e164.trim();
}

/** Отображение вида +375 (25) 111 11 11 */
export function formatBelarusPhoneSpaced(phone: string): string {
    const d = digitsOnly(phone);
    let op: string;
    let national: string;

    if (d.length === 12 && d.startsWith("375")) {
        op = d.slice(3, 5);
        national = d.slice(5);
    } else if (d.length === 9) {
        op = d.slice(0, 2);
        national = d.slice(2);
    } else {
        return phone.trim();
    }

    if (national.length !== 7) {
        return phone.trim();
    }

    return `+375 (${op}) ${national.slice(0, 3)} ${national.slice(3, 5)} ${national.slice(5)}`;
}

/** Короткий суффикс «640-88-33» из национальной части (после кода страны). */
export function phoneNationalShortSuffix(e164: string): string {
    const d = digitsOnly(e164);
    const national = d.startsWith("375") && d.length >= 12 ? d.slice(5, 14) : d.slice(-9);
    if (national.length !== 9) {
        return "";
    }
    return `${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8)}`;
}

export function buildHeaderPhoneDropdown(site: SiteContent): { label: string; href: string }[] {
    return [
        {
            label: `МТС: ${formatBelarusDisplay(site.contact_phone_mts)}`,
            href: telHref(site.contact_phone_mts),
        },
        {
            label: `A1: ${formatBelarusDisplay(site.contact_phone_a1)}`,
            href: telHref(site.contact_phone_a1),
        },
        {
            label: `life: ${formatBelarusDisplay(site.contact_phone_life)}`,
            href: telHref(site.contact_phone_life),
        },
    ];
}

export function buildPhoneLinks(site: SiteContent): { label: string; number: string }[] {
    return [
        { label: "МТС", number: telHref(site.contact_phone_mts).replace(/^tel:/, "") },
        { label: "A1", number: telHref(site.contact_phone_a1).replace(/^tel:/, "") },
        { label: "life", number: telHref(site.contact_phone_life).replace(/^tel:/, "") },
    ];
}

/** `https://t.me/…` → `tg://resolve?domain=…` для диплинка в шапке. */
export function telegramAppHrefFromWebUrl(url: string): string {
    const trimmed = url.trim();
    try {
        const u = new URL(trimmed);
        const host = u.hostname.replace(/^www\./, "");
        if (host === "t.me" || host === "telegram.me") {
            const seg = u.pathname
                .replace(/^\//, "")
                .split("/")
                .filter(Boolean)[0];
            if (seg && !seg.includes("?")) {
                return `tg://resolve?domain=${encodeURIComponent(seg)}`;
            }
        }
    } catch {
        /* не URL */
    }
    return trimmed;
}

export function buildMessengerLinks(site: SiteContent): Array<{
    id: string;
    label: string;
    appHref: string;
    webHref: string;
}> {
    const tgWeb = site.contact_telegram_url.trim();
    const viber = site.contact_viber_url.trim();
    return [
        {
            id: "telegram",
            label: "Telegram",
            appHref: telegramAppHrefFromWebUrl(tgWeb),
            webHref: tgWeb,
        },
        {
            id: "viber",
            label: "Viber",
            appHref: viber,
            webHref: viber,
        },
    ];
}

export function buildContactLinks(site: SiteContent): { label: string; href: string }[] {
    return [
        { label: "Telegram", href: site.contact_telegram_url.trim() },
        { label: "Viber", href: site.contact_viber_url.trim() },
    ];
}
