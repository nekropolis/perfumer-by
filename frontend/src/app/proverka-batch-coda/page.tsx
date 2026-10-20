import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import BatchCodeCheckForm from "@/components/batch-code/batch-code-check-form";
import HomeFaqAccordion from "@/components/home/home-faq-accordion";
import JsonLd from "@/components/seo/json-ld";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { fetchBatchCodeBrands } from "@/lib/batch-code-api";
import { BATCH_CODE_PAGE_FAQ } from "@/lib/batch-code-page-content";
import { breadcrumbListJsonLd, faqPageJsonLd } from "@/lib/json-ld";
import { buildSeoMetadata } from "@/lib/seo";
import { siteBtnSecondary } from "@/lib/site-ui-classes";

export const metadata: Metadata = buildSeoMetadata({
    title: "Проверка батч-кода парфюма — как найти и прочитать код | perfumer.by",
    description:
        "Как найти батч-код на флаконе и коробке, что он может рассказать об ориентировочной дате выпуска и почему код не доказывает подлинность. Справочная проверка для части брендов.",
    canonicalPath: "/proverka-batch-coda",
});

const getBrands = cache(async () => fetchBatchCodeBrands());

export default async function ProverkaBatchCodaPage() {
    const brands = await getBrands();
    const crumbs = [{ label: "Главная", href: "/" }, { label: "Проверка батч-кода" }];

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
                <JsonLd data={[breadcrumbListJsonLd(crumbs), faqPageJsonLd(BATCH_CODE_PAGE_FAQ)]} />
                <Breadcrumbs className="mb-6" items={crumbs} />

                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Проверка батч-кода парфюма</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-admin-text-secondary sm:text-base">
                    Батч-код (номер партии) помогает производителю отслеживать выпуск. Для некоторых брендов по формату
                    кода можно получить ориентировочный период производства. Это справочный инструмент: он не проверяет
                    подлинность и не заменяет осмотр упаковки и покупку у надёжного продавца.
                </p>

                <div className="mt-6">
                    <BatchCodeCheckForm brands={brands} />
                </div>

                <article className="mt-10 space-y-8 text-sm leading-relaxed text-admin-text-secondary sm:text-base">
                    <section>
                        <h2 className="text-lg font-semibold text-admin-text sm:text-xl">Что такое батч-код</h2>
                        <p className="mt-2">
                            Батч-код — это комбинация букв и цифр, которую наносят на партию флаконов. У разных брендов
                            формат разный: где-то это короткий штамп на дне, где-то длинная строка на коробке. Смысл кода
                            внутренний — для учёта на производстве и при обращениях в сервис.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-admin-text sm:text-xl">Где его найти</h2>
                        <ul className="mt-2 list-inside list-disc space-y-1">
                            <li>дно стеклянного или пластикового флакона;</li>
                            <li>нижняя или боковая часть коробки;</li>
                            <li>выдавленный рельеф, печать или наклейка;</li>
                            <li>код на коробке и на флаконе должен совпадать — если они различаются, стоит насторожиться.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-admin-text sm:text-xl">Что код может и не может сказать</h2>
                        <p className="mt-2">
                            Для части брендов по известным правилам можно предположить ориентировочный месяц или год
                            выпуска. Точность зависит от марки и качества ввода.
                        </p>
                        <p className="mt-2">
                            Код не доказывает, что флакон оригинальный: подделки тоже могут нести похожую маркировку.
                            Если сервис не вернул дату, это не означает подделку — возможно, бренд пока не в базе или
                            формат неоднозначен.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-admin-text sm:text-xl">Срок годности и хранение</h2>
                        <p className="mt-2">
                            На парфюмерии для рынка ЕАЭС на упаковке должны быть номер партии и срок годности или пометка
                            «использовать до». Дата изготовления указывается не всегда — ориентируйтесь на маркировку
                            производителя.
                        </p>
                        <p className="mt-2">
                            Храните духи в сухом месте без прямого солнца, с плотно закрытой крышкой. Резкие перепады
                            температуры и долгое открытое горло ускоряют изменение аромата.
                        </p>
                    </section>
                </article>

                <HomeFaqAccordion items={BATCH_CODE_PAGE_FAQ} />

                <section className="mt-10 rounded-xl border border-admin-border bg-admin-surface p-4 sm:p-5">
                    <p className="text-sm text-admin-text-secondary">
                        Напишите название марки и приложите фото кода — мы пополним справочник.
                    </p>
                    <Link href="/contacts" className={`${siteBtnSecondary} mt-4`}>
                        Не нашли бренд? Напишите нам
                    </Link>
                </section>
            </div>
        </main>
    );
}
