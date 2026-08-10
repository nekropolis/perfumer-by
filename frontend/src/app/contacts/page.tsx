import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import JsonLd from "@/components/seo/json-ld";
import { breadcrumbListJsonLd, localBusinessJsonLd } from "@/lib/json-ld";
import { fetchContactsPage } from "@/lib/contacts-api";
import { DEFAULT_SITE_CONTENT, type SiteContent } from "@/lib/site-content-api";
import {
    buildContactLinks,
    buildMessengerLinks,
    formatBelarusDisplay,
    telHref,
} from "@/lib/site-contact";
import { buildSeoMetadata } from "@/lib/seo";
import { siteCard, siteNavLink } from "@/lib/site-ui-classes";

const getContactsPageData = cache(async () => {
    try {
        return await fetchContactsPage();
    } catch {
        return null;
    }
});

export async function generateMetadata(): Promise<Metadata> {
    const data = await getContactsPageData();
    const page = data?.page;
    return buildSeoMetadata({
        title: page?.seo_title?.trim() || page?.h1?.trim() || page?.name?.trim() || "Контакты — Perfumer",
        description:
            page?.seo_description?.trim() ||
            "Телефоны, email и мессенджеры магазина Perfumer. Свяжитесь с нами по вопросам заказов.",
        canonicalPath: "/contacts",
    });
}

export default async function ContactsPage() {
    const data = await getContactsPageData();

    const site: SiteContent = {
        ...DEFAULT_SITE_CONTENT,
        contact_phone_mts: data?.contact_phone_mts ?? DEFAULT_SITE_CONTENT.contact_phone_mts,
        contact_phone_a1: data?.contact_phone_a1 ?? DEFAULT_SITE_CONTENT.contact_phone_a1,
        contact_phone_life: data?.contact_phone_life ?? DEFAULT_SITE_CONTENT.contact_phone_life,
        contact_email: data?.contact_email ?? DEFAULT_SITE_CONTENT.contact_email,
        legal_name: data?.legal_name ?? DEFAULT_SITE_CONTENT.legal_name,
        legal_unp: data?.legal_unp ?? DEFAULT_SITE_CONTENT.legal_unp,
        legal_address: data?.legal_address ?? DEFAULT_SITE_CONTENT.legal_address,
        contact_telegram_url: data?.contact_telegram_url ?? DEFAULT_SITE_CONTENT.contact_telegram_url,
        contact_viber_url: data?.contact_viber_url ?? DEFAULT_SITE_CONTENT.contact_viber_url,
    };

    const page = data?.page;
    const h1 = page?.h1?.trim() || page?.name?.trim() || "Контакты";
    const crumbs = [{ label: "Главная", href: "/" }, { label: h1 }];

    const phones = [
        { label: "МТС", value: site.contact_phone_mts },
        { label: "A1", value: site.contact_phone_a1 },
        { label: "life", value: site.contact_phone_life },
    ].filter((row) => row.value.trim());
    const email = site.contact_email.trim();
    const messengers = buildMessengerLinks(site).filter((row) => row.webHref);
    const contactLinks = buildContactLinks(site).filter((row) => row.href);

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <JsonLd data={[breadcrumbListJsonLd(crumbs), localBusinessJsonLd(site)]} />
                <Breadcrumbs className="mb-6" items={crumbs} />

                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{h1}</h1>

                {page?.content?.trim() ? (
                    <div
                        className="ProseMirror prose prose-sm mt-4 max-w-2xl text-admin-text sm:prose-base"
                        dangerouslySetInnerHTML={{ __html: page.content }}
                    />
                ) : (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-admin-text-secondary">
                        Свяжитесь с нами по телефону, email или в мессенджере — поможем с подбором
                        аромата и оформлением заказа.
                    </p>
                )}

                <div className="mt-8 grid gap-6 sm:grid-cols-2">
                    <section className={`${siteCard} p-5 sm:p-6`}>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                            Телефоны
                        </h2>
                        <ul className="mt-4 space-y-3">
                            {phones.map(({ label, value }) => (
                                <li key={label}>
                                    <a
                                        href={telHref(value)}
                                        className="flex items-center gap-2 text-base text-admin-text transition hover:text-admin-primary"
                                    >
                                        <span className="inline-flex shrink-0 rounded bg-admin-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-admin-text-secondary">
                                            {label}
                                        </span>
                                        {formatBelarusDisplay(value)}
                                    </a>
                                </li>
                            ))}
                        </ul>

                        {email ? (
                            <div className="mt-6 border-t border-admin-border pt-5">
                                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                                    Email
                                </h2>
                                <a
                                    href={`mailto:${email}`}
                                    className="mt-3 inline-block text-base text-admin-text transition hover:text-admin-primary"
                                >
                                    {email}
                                </a>
                            </div>
                        ) : null}

                        {(site.legal_name.trim() || site.legal_unp.trim() || site.legal_address.trim()) && (
                            <div className="mt-6 border-t border-admin-border pt-5">
                                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                                    Реквизиты
                                </h2>
                                <div className="mt-3 space-y-1 text-sm text-admin-text">
                                    {site.legal_name.trim() ? <div>{site.legal_name.trim()}</div> : null}
                                    {site.legal_unp.trim() ? <div>УНП {site.legal_unp.trim()}</div> : null}
                                    {site.legal_address.trim() ? <div>{site.legal_address.trim()}</div> : null}
                                </div>
                            </div>
                        )}
                    </section>

                    <section className={`${siteCard} p-5 sm:p-6`}>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                            Мессенджеры
                        </h2>
                        <ul className="mt-4 space-y-3">
                            {messengers.map((row) => (
                                <li key={row.id}>
                                    <a
                                        href={row.webHref}
                                        className={`${siteNavLink} text-base`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {row.label}
                                    </a>
                                </li>
                            ))}
                            {messengers.length === 0 && contactLinks.length > 0
                                ? contactLinks.map((row) => (
                                      <li key={row.label}>
                                          <a
                                              href={row.href}
                                              className={`${siteNavLink} text-base`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                          >
                                              {row.label}
                                          </a>
                                      </li>
                                  ))
                                : null}
                        </ul>
                    </section>
                </div>

                <p className="mt-8 text-sm text-admin-text-secondary">
                    Каталог ароматов —{" "}
                    <Link href="/catalog" className="font-medium text-admin-primary hover:underline">
                        перейти в каталог
                    </Link>
                    .
                </p>
            </div>
        </main>
    );
}
