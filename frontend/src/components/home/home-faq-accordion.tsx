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
    /** Карточка в одну линию с соседним блоком: заголовок внутри рамки. */
    variant?: "default" | "panel";
};

export default function HomeFaqAccordion({ items, variant = "default" }: Props) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);
    const panel = variant === "panel";

    return (
        <section className={panel ? `${siteCard} p-4 sm:p-5` : "mt-10"}>
            <h2
                className={
                    panel
                        ? "text-lg font-semibold text-admin-text"
                        : "text-2xl font-semibold tracking-tight text-admin-text sm:text-3xl"
                }
            >
                Вопросы и ответы
            </h2>

            <div className={panel ? "mt-4 divide-y divide-admin-border border-t border-admin-border" : "mt-5 space-y-2"}>
                {items.map((item, index) => {
                    const isOpen = openIndex === index;
                    const panelId = `faq-panel-${index}`;
                    const buttonId = `faq-button-${index}`;

                    return (
                        <div key={item.question} className={panel ? "" : `${siteCard} overflow-hidden`}>
                            <button
                                id={buttonId}
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => setOpenIndex(isOpen ? null : index)}
                                className={`flex w-full items-start justify-between gap-4 text-left transition hover:bg-admin-muted/50 ${
                                    panel ? "px-1 py-3" : "px-4 py-4 sm:px-5"
                                }`}
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
                                    <p
                                        className={`border-t border-admin-border text-sm leading-7 text-admin-text-secondary ${
                                            panel ? "px-1 pb-3 pt-3" : "px-4 pb-4 pt-3 sm:px-5"
                                        }`}
                                    >
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
