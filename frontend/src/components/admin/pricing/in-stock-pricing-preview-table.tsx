"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { InStockPricingPreviewRow } from "@/lib/admin-pricing-api";

type TooltipKind = "input" | "offers" | "will";

type TooltipState = {
    kind: TooltipKind;
    left: number;
    top: number;
    placement: "above" | "below";
    row: InStockPricingPreviewRow;
};

type Props = {
    items: InStockPricingPreviewRow[];
};

export default function InStockPricingPreviewTable({ items }: Props) {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearCloseTimer = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };

    const scheduleClose = () => {
        clearCloseTimer();
        closeTimerRef.current = setTimeout(() => {
            setTooltip(null);
            closeTimerRef.current = null;
        }, 300);
    };

    const openTooltip = (kind: TooltipKind, rect: DOMRect, row: InStockPricingPreviewRow) => {
        clearCloseTimer();
        const count =
            kind === "offers" || kind === "will"
                ? Math.max(row.allparfume?.offers.length ?? 0, 3)
                : (row.input_sources?.length ?? 0);
        const estimatedHeight = Math.min(16 + count * 28, 280);
        const spaceBelow = window.innerHeight - rect.bottom;
        const placeAbove = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight + 12;
        setTooltip({
            kind,
            left: rect.left,
            top: placeAbove ? rect.top + 4 : rect.top - 4,
            placement: placeAbove ? "above" : "below",
            row,
        });
    };

    useEffect(() => () => clearCloseTimer(), []);

    return (
        <>
            <div className="min-w-0 overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[960px] table-fixed text-sm">
                    <colgroup>
                        <col style={{ width: "72px" }} />
                        <col style={{ width: "34%" }} />
                        <col style={{ width: "88px" }} />
                        <col style={{ width: "120px" }} />
                        <col style={{ width: "88px" }} />
                        <col style={{ width: "88px" }} />
                    </colgroup>
                    <thead className="bg-admin-muted">
                        <tr className="text-left text-xs">
                            <th className="px-2 py-2 font-medium">ID</th>
                            <th className="px-3 py-2 font-medium">Товар</th>
                            <th className="px-2 py-2 text-right font-medium">Вход</th>
                            <th className="px-2 py-2 font-medium">Роль</th>
                            <th className="px-2 py-2 text-right font-medium">На сайте</th>
                            <th className="px-2 py-2 text-right font-medium">Будет</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((row) => (
                            <tr key={row.variant_id} className="border-t align-top">
                                <td className="px-2 py-2 tabular-nums text-xs text-admin-text-secondary">
                                    {row.variant_id}
                                </td>
                                <td className="px-3 py-2">
                                    {row.product_slug ? (
                                        <Link
                                            href={`/${row.product_slug}`}
                                            target="_blank"
                                            className="break-words font-medium hover:underline"
                                        >
                                            {row.product_name}
                                        </Link>
                                    ) : (
                                        <span className="break-words font-medium">{row.product_name}</span>
                                    )}
                                    <div className="text-xs text-admin-text-secondary">{row.variant_label}</div>
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums text-xs">
                                    {row.input_price && (row.input_sources?.length ?? 0) > 0 ? (
                                        <span
                                            className="cursor-pointer underline decoration-dotted underline-offset-2"
                                            onMouseEnter={(e) =>
                                                openTooltip("input", e.currentTarget.getBoundingClientRect(), row)
                                            }
                                            onMouseLeave={scheduleClose}
                                        >
                                            {row.input_price}
                                        </span>
                                    ) : (
                                        (row.input_price ?? "—")
                                    )}
                                </td>
                                <td className="px-2 py-2 text-xs">
                                    {row.role === "allparfume" && row.allparfume ? (
                                        <span
                                            className="cursor-pointer underline decoration-dotted underline-offset-2"
                                            onMouseEnter={(e) =>
                                                openTooltip("offers", e.currentTarget.getBoundingClientRect(), row)
                                            }
                                            onMouseLeave={scheduleClose}
                                        >
                                            allparfume
                                            {row.allparfume.selected_offer_role
                                                ? ` (${row.allparfume.selected_offer_role})`
                                                : ""}
                                        </span>
                                    ) : (
                                        <span className="text-admin-text-secondary">обычная</span>
                                    )}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums text-xs">
                                    {row.site_price ?? "—"}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums text-xs font-medium">
                                    {row.proposed_site_price ? (
                                        <span
                                            className="cursor-pointer underline decoration-dotted underline-offset-2"
                                            onMouseEnter={(e) =>
                                                openTooltip("will", e.currentTarget.getBoundingClientRect(), row)
                                            }
                                            onMouseLeave={scheduleClose}
                                        >
                                            {row.proposed_site_price}
                                            {row.manual ? (
                                                <span className="ml-1 text-[10px] font-normal text-amber-700">руч.</span>
                                            ) : null}
                                        </span>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {tooltip?.kind === "input" && (tooltip.row.input_sources?.length ?? 0) > 0 ? (
                <div
                    className={`fixed z-[300] flex -translate-x-full ${tooltip.placement === "above" ? "-translate-y-full" : ""}`}
                    style={{ left: tooltip.left, top: tooltip.top }}
                    onMouseEnter={clearCloseTimer}
                    onMouseLeave={scheduleClose}
                >
                    <div className="w-72 rounded-lg border bg-white p-2 text-left shadow-lg">
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-admin-text-secondary">
                            Источники входа
                        </div>
                        <ul className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain">
                            {tooltip.row.input_sources.map((src, index) => (
                                <li
                                    key={`${src.source}-${src.source_label}-${src.price}-${index}`}
                                    className={`flex items-start justify-between gap-2 text-[11px] ${src.selected ? "font-semibold text-admin-text" : "text-admin-text"}`}
                                >
                                    <span className="min-w-0">
                                        <span className="break-words">
                                            {src.source_label}
                                            {src.selected ? (
                                                <span className="ml-1 text-emerald-700">✓</span>
                                            ) : null}
                                        </span>
                                        {src.product_name ? (
                                            <span className="mt-0.5 block break-words font-normal text-admin-text-secondary">
                                                {src.product_name}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="shrink-0 tabular-nums">{src.price}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div
                        className={`w-3 shrink-0 ${tooltip.placement === "above" ? "self-end h-6" : ""}`}
                        aria-hidden
                    />
                </div>
            ) : null}

            {tooltip?.kind === "offers" && tooltip.row.allparfume ? (
                <div
                    className={`fixed z-[300] flex -translate-x-full ${tooltip.placement === "above" ? "-translate-y-full" : ""}`}
                    style={{ left: tooltip.left, top: tooltip.top }}
                    onMouseEnter={clearCloseTimer}
                    onMouseLeave={scheduleClose}
                >
                    <div className="w-60 rounded-lg border bg-white p-2 text-left shadow-lg">
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-admin-text-secondary">
                            Офферы allparfume
                        </div>
                        <ul className="max-h-56 space-y-1 overflow-y-auto overscroll-contain">
                            {tooltip.row.allparfume.offers.map((offer) => (
                                <li
                                    key={`${offer.shop_key}-${offer.price}`}
                                    className={`flex items-start justify-between gap-2 text-[11px] ${offer.selected ? "font-semibold text-admin-text" : "text-admin-text"}`}
                                >
                                    <span className="min-w-0 break-words">
                                        {offer.shop_name}
                                        {offer.role ? (
                                            <span className="ml-1 text-admin-text-secondary">({offer.role})</span>
                                        ) : null}
                                        {offer.selected ? (
                                            <span className="ml-1 text-emerald-700">✓</span>
                                        ) : null}
                                    </span>
                                    <span className="shrink-0 tabular-nums">{offer.price}</span>
                                </li>
                            ))}
                        </ul>
                        {tooltip.row.allparfume.selected_purchase ? (
                            <div className="mt-2 border-t pt-1 text-[11px] text-admin-text-secondary">
                                В расчёт: {tooltip.row.allparfume.selected_purchase}
                            </div>
                        ) : null}
                    </div>
                    <div
                        className={`w-3 shrink-0 ${tooltip.placement === "above" ? "self-end h-6" : ""}`}
                        aria-hidden
                    />
                </div>
            ) : null}

            {tooltip?.kind === "will" ? (
                <div
                    className={`fixed z-[300] flex -translate-x-full ${tooltip.placement === "above" ? "-translate-y-full" : ""}`}
                    style={{ left: tooltip.left, top: tooltip.top }}
                    onMouseEnter={clearCloseTimer}
                    onMouseLeave={scheduleClose}
                >
                    <div className="w-72 rounded-lg border bg-white p-2 text-left shadow-lg">
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-admin-text-secondary">
                            Как получена цена «Будет»
                        </div>
                        <div className="space-y-1 text-[11px] text-admin-text">
                            <div>
                                Роль:{" "}
                                <span className="font-medium">
                                    {tooltip.row.role === "allparfume" ? "allparfume" : "обычная"}
                                </span>
                            </div>
                            {tooltip.row.sellable_price || tooltip.row.allparfume?.sellable_price ? (
                                <div>
                                    После формулы −13%:{" "}
                                    <span className="tabular-nums font-medium">
                                        {tooltip.row.sellable_price ?? tooltip.row.allparfume?.sellable_price}
                                    </span>
                                </div>
                            ) : null}
                            {tooltip.row.allparfume?.selected_shop_name ? (
                                <div>
                                    Привязка к офферу:{" "}
                                    <span className="font-medium">{tooltip.row.allparfume.selected_shop_name}</span>
                                    {tooltip.row.allparfume.selected_purchase ? (
                                        <span className="ml-1 tabular-nums">
                                            ({tooltip.row.allparfume.selected_purchase})
                                        </span>
                                    ) : null}
                                    {tooltip.row.allparfume.selected_offer_role ? (
                                        <span className="ml-1 text-admin-text-secondary">
                                            [{tooltip.row.allparfume.selected_offer_role}]
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                            {tooltip.row.manual ? (
                                <div className="text-amber-800">
                                    Ручная очередь: {tooltip.row.manual.reason}
                                    {tooltip.row.manual.manual_retail_price
                                        ? ` · цена ${tooltip.row.manual.manual_retail_price}`
                                        : ""}
                                </div>
                            ) : null}
                            <div className="border-t pt-1 font-semibold tabular-nums">
                                Итог: {tooltip.row.proposed_site_price}
                            </div>
                        </div>
                    </div>
                    <div
                        className={`w-3 shrink-0 ${tooltip.placement === "above" ? "self-end h-6" : ""}`}
                        aria-hidden
                    />
                </div>
            ) : null}
        </>
    );
}
