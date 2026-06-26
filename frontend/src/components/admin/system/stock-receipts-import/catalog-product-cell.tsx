import {
    findSellerOneRowNameMatchInfo,
    getRowCatalogProductLabel,
    getSuggestedProductOnlyMessage,
    isSimilarProductMatch,
} from "@/components/admin/import-export/seller-one/utils";
import { HighlightedNameText } from "@/components/admin/import-export/seller-one/ui";
import type { StockReceiptImportCatalogVariant, StockReceiptImportUnresolvedRow } from "./types";
import { importRowAsSellerOneView } from "./utils";

type StockReceiptCatalogProductCellProps = {
    row: StockReceiptImportUnresolvedRow;
    mappingByKey: Record<string, string>;
    onOpenManualLinkAction: (row: StockReceiptImportUnresolvedRow) => void;
};

export function StockReceiptCatalogProductCell({
    row,
    mappingByKey,
    onOpenManualLinkAction,
}: StockReceiptCatalogProductCellProps) {
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

    return (
        <td
            className="cursor-pointer px-3 py-3 text-xs whitespace-normal break-words"
            onClick={() => onOpenManualLinkAction(row)}
        >
            {sellerOneRow.is_linked && sellerOneRow.linked_variant ? (
                <div>
                    <HighlightedNameText
                        text={
                            sellerOneRow.linked_variant.display_name
                            || sellerOneRow.linked_variant.product_name
                            || ""
                        }
                        matchInfo={nameMatchInfo}
                        highlightSource="catalog"
                        className="break-words font-medium"
                    />
                    <div className="break-words text-admin-text-secondary">
                        {sellerOneRow.linked_variant.display || "Вариант без параметров"}
                    </div>
                </div>
            ) : sellerOneRow.suggested_variant ? (
                <div>
                    <HighlightedNameText
                        text={
                            sellerOneRow.suggested_variant.display_name
                            || sellerOneRow.suggested_variant.product_name
                            || ""
                        }
                        matchInfo={nameMatchInfo}
                        highlightSource="catalog"
                        className="break-words font-medium"
                    />
                    <div className="break-words text-admin-text-secondary">
                        {sellerOneRow.suggested_variant.display || "Вариант без параметров"}
                    </div>
                    {isSimilarProductMatch(sellerOneRow.match_confidence_breakdown) ? (
                        <div className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                            {getSuggestedProductOnlyMessage(
                                sellerOneRow.match_confidence_breakdown,
                                0,
                            )}
                        </div>
                    ) : null}
                </div>
            ) : sellerOneRow.suggested_product ? (
                <div>
                    <HighlightedNameText
                        text={
                            sellerOneRow.suggested_product.display_name
                            || sellerOneRow.suggested_product.name
                            || ""
                        }
                        matchInfo={nameMatchInfo}
                        highlightSource="catalog"
                        className="break-words font-medium"
                    />
                    <div className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                        {getSuggestedProductOnlyMessage(
                            sellerOneRow.match_confidence_breakdown,
                            sellerOneRow.suggested_product.variants_count ?? 0,
                        )}
                    </div>
                </div>
            ) : (
                <span className="inline-block origin-left text-admin-text-secondary transition-all duration-150 hover:scale-[1.03] hover:text-admin-text">
                    Выберите связь
                </span>
            )}
        </td>
    );
}
