export default function AdminPricingLogicPage() {
    return (
        <div className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-admin-text">
            <p className="text-admin-text-secondary">
                Правила розничной цены при «Обновить цены» и в превью склада
            </p>

            <section className="space-y-2">
                <h2 className="text-base font-semibold">Приоритет</h2>
                <ol className="list-decimal space-y-1 pl-5">
                    <li>
                        Есть связь с Allparfume и активные офферы с флагом «в цене» (без Perfumer.by) →
                        ветка Allparfume.
                    </li>
                    <li>Иначе при наличии складского входа → ветка склада.</li>
                    <li>Иначе — формула от минимального офера поставщика (XLS), если он есть.</li>
                </ol>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold">0. Perfumer.by</h2>
                <p>
                    Собственный магазин на Allparfume не участвует в сборе офферов и в расчёте цены.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold">1. Склад</h2>
                <p>
                    «Офер» здесь — вход поставщика (listing / прайс), не магазины Allparfume. Курс BYN и
                    формулы — как в шапке админки / «Формулы цен».
                </p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>Нет офера поставщика → ручная очередь («Нет поставщика»).</li>
                    <li>
                        Склад ≤ офер → вход формулы = (склад + 2×офер) / 3. Если |склад−офер| / офер &gt;
                        30% → в ручную с рассчитанной ценой, витрина выкл. Иначе — auto-apply.
                    </li>
                    <li>
                        Склад &gt; офер и разница &gt; 10% → розница = склад − 10%, ручная очередь с этой
                        ценой.
                    </li>
                    <li>Склад &gt; офер и разница ≤ 10% → формула от входа офера, auto-apply.</li>
                </ul>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold">2. Allparfume</h2>
                <ol className="list-decimal space-y-1 pl-5">
                    <li>Вход = min(склад, мин. офер поставщика).</li>
                    <li>Базовая розница = формула от входа.</li>
                    <li>Sellable = базовая × 0.87 (−13%).</li>
                    <li>
                        Офферы магазинов (только активные магазины), по возрастанию цены:
                        <ul className="mt-1 list-disc pl-5">
                            <li>sellable &lt; min → сайт = min;</li>
                            <li>иначе первый оффер ≥ sellable;</li>
                            <li>если выше всех → ручная очередь с sellable.</li>
                        </ul>
                    </li>
                </ol>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold">Admin Allparfume</h2>
                <ul className="list-disc space-y-1 pl-5">
                    <li>
                        <strong>Обновить цены</strong> — только уже сохранённые после парсинга
                        товары: обновляет цены/офферы, новые карточки не создаёт.
                    </li>
                    <li>
                        <strong>Парсинг</strong> — проходит по всем брендам allparfume.by; создаёт
                        новые товары, варианты и офферы, обновляет существующие.
                    </li>
                    <li>
                        <strong>Магазины</strong> — чекбокс «Активен»: какие магазины участвуют в
                        «Обновить цены» / «Парсинг» и в расчёте розницы.
                    </li>
                </ul>
            </section>
        </div>
    );
}
