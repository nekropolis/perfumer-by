import { getApiBase } from "@/lib/api";
import type { CmsPublicPage } from "@/lib/cms-pages-api";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content-api";

export type ContactsPagePayload = {
    page: CmsPublicPage;
    contact_phone_mts: string;
    contact_phone_a1: string;
    contact_phone_life: string;
    contact_email: string;
    legal_name: string;
    legal_unp: string;
    legal_address: string;
    contact_telegram_url: string;
    contact_viber_url: string;
};

export type ContactsPageResponse = {
    data: ContactsPagePayload;
};

export async function fetchContactsPage(): Promise<ContactsPagePayload | null> {
    const base = getApiBase();
    const res = await fetch(`${base}/site/contacts`, {
        next: { revalidate: 300, tags: ["site-contacts", "site-content"] },
    });

    if (res.status === 404) {
        return null;
    }

    if (!res.ok) {
        throw new Error(`Contacts page API error: ${res.status}`);
    }

    const json = (await res.json()) as ContactsPageResponse;
    const data = json.data;
    if (!data?.page) {
        return null;
    }

    return {
        page: data.page,
        contact_phone_mts: data.contact_phone_mts?.trim() || DEFAULT_SITE_CONTENT.contact_phone_mts,
        contact_phone_a1: data.contact_phone_a1?.trim() || DEFAULT_SITE_CONTENT.contact_phone_a1,
        contact_phone_life: data.contact_phone_life?.trim() || DEFAULT_SITE_CONTENT.contact_phone_life,
        contact_email: data.contact_email?.trim() || DEFAULT_SITE_CONTENT.contact_email,
        legal_name: data.legal_name?.trim() || DEFAULT_SITE_CONTENT.legal_name,
        legal_unp: data.legal_unp?.trim() || DEFAULT_SITE_CONTENT.legal_unp,
        legal_address: data.legal_address?.trim() || DEFAULT_SITE_CONTENT.legal_address,
        contact_telegram_url:
            data.contact_telegram_url?.trim() || DEFAULT_SITE_CONTENT.contact_telegram_url,
        contact_viber_url: data.contact_viber_url?.trim() || DEFAULT_SITE_CONTENT.contact_viber_url,
    };
}
