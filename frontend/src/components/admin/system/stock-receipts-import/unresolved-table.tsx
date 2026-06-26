import { ConfidenceBadge, HighlightedNameText } from "@/components/admin/import-export/seller-one/ui";
import {
    canConfirmSuggestedLink,
    findSellerOneRowNameMatchInfo,
    getRowCatalogProductLabel,
} from "@/components/admin/import-export/seller-one/utils";
import type { StockReceiptImportUnresolvedRow } from "./types";
import { StockReceiptCatalogProductCell } from "./catalog-product-cell";
import { importRowAsSellerOneView, isImportRowLinked } from "./utils";

type StockReceiptUnresolvedTableProps = {
    rows: StockReceiptImportUnresolvedRow[];
    mappingByKey: Record<string, string>;
    onToggleLinkAction: (row: StockReceiptImportUnresolvedRow, checked: boolean) => void;
    onOpenManualLinkAction: (row: StockReceiptImportUnresolvedRow) => void;
};

export function StockReceiptUnresolvedTable({
    rows,
    mappingByKey,
    onToggleLinkAction,
    onOpenManualLinkAction,
}: StockReceiptUnresolvedTableProps) {
    return (
        <div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="min-w-full text-xs">
                <thead className="bg-admin-muted text-left text-admin-text-secondary">
                    <tr>
                        <th className="px-2 py-2 text-center font-medium whitespace-nowrap">Связка</th>
                        <th className="px-2 py-2 font-medium whitespace-nowrap">Код</th>
                        <th className="px-3 py-2 font-medium">Название</th>
                        <th className="px-2 py-2 font-medium whitespace-nowrap">Qty</th>
                        <th className="px-2 py-2 font-medium whitespace-nowrap">Статус</th>
                        <th className="px-3 py-2 font-medium">Продукт каталога</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const sellerOneRow = importRowAsSellerOneView(row, mappingByKey);
                        const catalogProductLabel = getRowCatalogProductLabel(sellerOneRow);
                        const nameMatchInfo = catalogProductLabel
                            ? findSellerOneRowNameMatchInfo(sellerOneRow, catalogProductLabel)
                            : {
                                words: [],
                                catalogWords: [],
                                exact: false,
                                brandPrefix: null,
                                catalogBrandPrefix: null,
                            };
                        const isLinked = isImportRowLinked(row.map_key, mappingByKey);

                        return (
                            <tr key={row.map_key} className="border-t align-top">
                                <td className="px-2 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        checked={isLinked}
                                        disabled={!canConfirmSuggestedLink({
                                            ...sellerOneRow,
                                            is_linked: isLinked,
                                        })}
                                        title={
                                            !canConfirmSuggestedLink({
                                                ...sellerOneRow,
                                                is_linked: isLinked,
                                            }) && !isLinked
                                                ? "Галочка только при 100% и точном имени; иначе — ручная связка"
                                                : undefined
                                        }
                                        onChange={(e) => onToggleLinkAction(row, e.target.checked)}
                                        className="h-4 w-4 cursor-pointer rounded border border-gray-400 accent-blue-600 shadow-sm focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed"
                                    />
                                </td>
                                <td className="whitespace-nowrap px-2 py-3 font-medium">{row.code || "—"}</td>
                                <td className="px-3 py-3">
                                    <HighlightedNameText
                                        text={row.title || "—"}
                                        matchInfo={nameMatchInfo}
                                        className="break-words font-medium"
                                    />
                                    <div className="text-xs text-admin-text-secondary">
                                        Цена: {row.supplier_price ?? "—"}
                                    </div>
                                </td>
                                <td className="whitespace-nowrap px-2 py-3">{row.qty ?? 0}</td>
                                <td className="whitespace-nowrap px-2 py-3">
                                    {sellerOneRow.status === "confirmed" ? (
                                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                                            Подтверждено
                                        </span>
                                    ) : sellerOneRow.status === "found_unconfirmed" ? (
                                        <ConfidenceBadge
                                            label="Найдена связь"
                                            confidence={sellerOneRow.match_confidence}
                                        />
                                    ) : sellerOneRow.status === "new" ? (
                                        <ConfidenceBadge label="Новый" confidence={sellerOneRow.match_confidence} />
                                    ) : (
                                        <ConfidenceBadge label="Не связан" confidence={sellerOneRow.match_confidence} />
                                    )}
                                </td>
                                <StockReceiptCatalogProductCell
                                    row={row}
                                    mappingByKey={mappingByKey}
                                    onOpenManualLinkAction={onOpenManualLinkAction}
                                />
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
