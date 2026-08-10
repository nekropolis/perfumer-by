import Breadcrumbs from "@/components/ui/breadcrumbs";
import GiftCertificateTemplateCard from "@/components/gift-certificates/gift-certificate-template-card";
import CmsSnippet from "@/components/cms/cms-snippet";
import { fetchGiftCertificateTemplates, type GiftCertificateTemplatePublic } from "@/lib/cart-api";
import { siteCard } from "@/lib/site-ui-classes";

const crumbs = [
    { label: "Главная", href: "/" },
    { label: "Подарочные сертификаты" },
] as const;

export default async function GiftCertificatesCatalogPage() {
    let templates: GiftCertificateTemplatePublic[] = [];
    let error = "";

    try {
        const res = await fetchGiftCertificateTemplates();
        templates = res.data ?? [];
    } catch {
        error = "Не удалось загрузить шаблоны сертификатов";
    }

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
                <Breadcrumbs className="mb-6" items={[...crumbs]} />

                <div className="mb-8">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Подарочные сертификаты</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-admin-text-secondary">
                        Выберите номинал и добавьте сертификат в корзину. После оплаты получатель сможет
                        использовать его при покупке в магазине.
                    </p>
                </div>

                {error ? <div className="text-sm text-red-600">{error}</div> : null}

                {!error && templates.length === 0 ? (
                    <div className={`${siteCard} px-6 py-10 text-sm text-admin-text-secondary`}>
                        Сертификаты временно недоступны.
                    </div>
                ) : null}

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                    {templates.map((template) => (
                        <GiftCertificateTemplateCard key={template.id} template={template} />
                    ))}
                </div>

                <CmsSnippet
                    code="faq-sertifikaty"
                    className={`${siteCard} mt-10 p-5 sm:p-6`}
                    fallbackTitle="Вопросы по сертификатам"
                />
            </div>
        </main>
    );
}
