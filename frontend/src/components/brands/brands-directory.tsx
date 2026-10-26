"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CatalogBrandItem } from "@/types/catalog";
import { orderedLettersWithBrands } from "@/lib/brand-letter-groups";
import { siteCard, siteInput } from "@/lib/site-ui-classes";

type Props = {
    brandsByLetter: Record<string, CatalogBrandItem[]>;
};

export default function BrandsDirectory({ brandsByLetter }: Props) {
    const [query, setQuery] = useState("");
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");

    const groupsMap = useMemo(() => {
        const groups = new Map<string, CatalogBrandItem[]>(Object.entries(brandsByLetter));
        if (!normalizedQuery) {
            return groups;
        }

        const filtered = new Map<string, CatalogBrandItem[]>();
        for (const [letter, brands] of groups) {
            const matches = brands.filter((brand) => brand.name.toLocaleLowerCase("ru").includes(normalizedQuery));
            if (matches.length > 0) {
                filtered.set(letter, matches);
            }
        }
        return filtered;
    }, [brandsByLetter, normalizedQuery]);

    const sectionLetters = useMemo(() => orderedLettersWithBrands(groupsMap), [groupsMap]);

    const scrollToBrandLetter = (letter: string) => {
        document.getElementById(`brand-letter-${letter}`)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    };

    return (
        <div className="space-y-6">
            <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск бренда"
                aria-label="Поиск бренда"
                className={siteInput}
            />

            {sectionLetters.length > 0 ? (
                <div className="flex flex-wrap gap-1 border-b border-admin-border pb-3">
                    {sectionLetters.map((letter) => (
                        <button
                            key={`anchor-${letter}`}
                            type="button"
                            onClick={() => scrollToBrandLetter(letter)}
                            className="rounded-2xl border border-admin-border bg-admin-surface px-2.5 py-1.5 text-xs font-medium text-admin-text transition hover:bg-admin-muted"
                        >
                            {letter}
                        </button>
                    ))}
                </div>
            ) : null}

            {sectionLetters.length === 0 ? (
                <p className="text-sm text-admin-text-secondary">Бренд не найден</p>
            ) : null}

            <div className="space-y-10">
                {sectionLetters.map((letter) => {
                    const brands = groupsMap.get(letter) ?? [];
                    return (
                        <section
                            key={`group-${letter}`}
                            id={`brand-letter-${letter}`}
                            className="scroll-mt-24 space-y-3"
                        >
                            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-secondary">
                                {letter}
                            </h2>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                {brands.map((brand) => (
                                    <Link
                                        key={brand.id}
                                        href={`/brands/${brand.slug}`}
                                        className={`${siteCard} px-4 py-3 text-sm text-admin-text transition hover:border-admin-border-strong hover:bg-admin-muted`}
                                    >
                                        {brand.name}
                                    </Link>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
