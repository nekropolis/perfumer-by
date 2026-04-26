"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { CatalogBrandItem } from "@/types/catalog";
import { orderedLettersWithBrands } from "@/lib/brand-letter-groups";

type Props = {
    brandsByLetter: Record<string, CatalogBrandItem[]>;
};

export default function BrandsDirectory({ brandsByLetter }: Props) {
    const groupsMap = useMemo(
        () => new Map<string, CatalogBrandItem[]>(Object.entries(brandsByLetter)),
        [brandsByLetter],
    );

    const sectionLetters = useMemo(() => orderedLettersWithBrands(groupsMap), [groupsMap]);

    const scrollToBrandLetter = (letter: string) => {
        document.getElementById(`brand-letter-${letter}`)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-3">
                {sectionLetters.map((letter) => (
                    <button
                        key={`anchor-${letter}`}
                        type="button"
                        onClick={() => scrollToBrandLetter(letter)}
                        className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"
                    >
                        {letter}
                    </button>
                ))}
            </div>

            <div className="space-y-10">
                {sectionLetters.map((letter) => {
                    const brands = groupsMap.get(letter) ?? [];
                    return (
                        <section
                            key={`group-${letter}`}
                            id={`brand-letter-${letter}`}
                            className="scroll-mt-24 space-y-3"
                        >
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                                {letter}
                            </h2>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                                {brands.map((brand) => (
                                    <Link
                                        key={brand.id}
                                        href={`/brands/${brand.slug}`}
                                        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)] hover:shadow-sm"
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
