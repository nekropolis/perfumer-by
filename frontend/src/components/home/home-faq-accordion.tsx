"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { siteCard } from "@/lib/site-ui-classes";

type FaqItem = {
    question: string;
    answer: string;
};

type Props = {
    items: readonly FaqItem[];
};

export default function HomeFaqAccordion({ items }: Props) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section className="mt-10">
            <h2 className="text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl">
                Вопросы и ответы
            </h2>

            <div className="mt-5 space-y-2">
                {items.map((item, index) => {
                    const isOpen = openIndex === index;
                    const panelId = `faq-panel-${index}`;
                    const buttonId = `faq-button-${index}`;

                    return (
                        <div key={item.question} className={`${siteCard} overflow-hidden`}>
                            <button
                                id={buttonId}
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => setOpenIndex(isOpen ? null : index)}
                                className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-admin-muted/50 sm:px-5"
                            >
                                <span className="text-sm font-semibold text-admin-text sm:text-base">
                                    {item.question}
                                </span>
                                <ChevronDown
                                    className={`mt-0.5 h-5 w-5 shrink-0 text-admin-text-secondary transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                    aria-hidden
                                />
                            </button>

                            <div
                                id={panelId}
                                role="region"
                                aria-labelledby={buttonId}
                                className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                            >
                                <div className="overflow-hidden">
                                    <p className="border-t border-admin-border px-4 pb-4 pt-3 text-sm leading-7 text-admin-text-secondary sm:px-5">
                                        {item.answer}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
