"use client";

import Link from "next/link";
import { Boxes, Pencil, Trash2 } from "lucide-react";
import type { ProductAdminItem } from "@/lib/admin-products-api";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";
import { resolveProductStatuses } from "@/lib/product-statuses";

type Props = {
    items: ProductAdminItem[];
    searchQuery?: string;
    onDeleteAction: (item: ProductAdminItem) => void;
    onVariantsAction: (item: ProductAdminItem) => void;
};

function StatusBadge({ active }: { active: boolean }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                active
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-admin-text-secondary"
            }`}
        >
            {active ? "Активен" : "Неактивен"}
        </span>
    );
}

function ProductStatusChips({
                                isNew,
                                isHit,
                                hasDiscount,
                            }: {
    isNew: boolean;
    isHit: boolean;
    hasDiscount: boolean;
}) {
    const chips = resolveProductStatuses({ isNew, isHit, hasDiscount });

    if (chips.length === 0) {
        return <span className="text-xs text-gray-400">—</span>;
    }

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {chips.map((chip) => (
                <span
                    key={chip.code}
                    className={`text-[9px] font-semibold leading-none ${chip.adminClassName}`}
                >
                    {chip.shortLabel}
                </span>
            ))}
        </div>
    );
}

export default function ProductsTable({
    items,
    searchQuery = "",
    onDeleteAction,
    onVariantsAction,
}: Props) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-admin-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-secondary">
                <tr>
                    <th className="px-3 py-2.5">ID</th>
                    <th className="px-3 py-2.5">Бренд</th>
                    <th className="px-3 py-2.5">Название</th>
                    <th className="px-3 py-2.5">Slug</th>
                    <th className="px-3 py-2.5">Статус</th>
                    <th className="px-3 py-2.5">Метки</th>
                    <th className="px-3 py-2.5">Вариантов</th>
                    <th className="px-3 py-2.5 text-right">Действия</th>
                </tr>
                </thead>
                <tbody>
                {items.map((item) => {
                    const brandName = item.brand?.name ?? null;

                    return (
                    <tr key={item.id} className="border-t border-admin-border align-center transition hover:bg-admin-muted/70">
                        <td className="px-3 py-3 text-admin-text-secondary">
                            {highlightAdminSearchTerms(String(item.id), searchQuery, brandName)}
                        </td>
                        <td className="px-3 py-3 text-admin-text">
                            {highlightAdminSearchTerms(item.brand?.name ?? "—", searchQuery)}
                        </td>
                        <td className="px-3 py-3 font-medium text-admin-text">
                            <div>{highlightAdminSearchTerms(item.name, searchQuery, brandName)}</div>
                            {item.matched_variant_ids && item.matched_variant_ids.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {item.matched_variant_ids.map((variantId) => (
                                        <span
                                            key={`${item.id}-variant-${variantId}`}
                                            className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
                                        >
                                            вариант: #{highlightAdminSearchTerms(String(variantId), searchQuery, brandName)}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </td>
                        <td className="px-3 py-3 text-admin-text-secondary">
                            {highlightAdminSearchTerms(item.slug, searchQuery, brandName)}
                        </td>
                        <td className="px-3 py-3">
                            <StatusBadge active={item.is_active} />
                        </td>
                        <td className="px-3 py-3">
                            <ProductStatusChips
                                isNew={Boolean(item.is_new)}
                                isHit={Boolean(item.is_hit)}
                                hasDiscount={Boolean((item.discounted_variants_count ?? 0) > 0)}
                            />
                        </td>
                        <td className="px-3 py-3 text-admin-text">
                            <button
                                type="button"
                                onClick={() => onVariantsAction(item)}
                                disabled={item.variants_count <= 0}
                                className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-admin-border px-2 text-xs font-medium text-admin-text transition hover:bg-admin-muted disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Открыть варианты товара ${item.name}`}
                                title="Открыть варианты"
                            >
                                <span className="sr-only">Варианты</span>
                                <Boxes size={14} className="mr-1" />
                                {item.variants_count}
                            </button>
                        </td>
                        <td className="px-3 py-3">
                            <div className="flex justify-end gap-1.5">
                                <Link
                                    href={`/admin/products/${item.id}/edit`}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                    aria-label={`Редактировать товар ${item.name}`}
                                    title="Редактировать"
                                >
                                    <Pencil size={16} />
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => onDeleteAction(item)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                    aria-label={`Удалить товар ${item.name}`}
                                    title="Удалить"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </td>
                    </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
}
