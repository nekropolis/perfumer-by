<?php

namespace Modules\ImportExport\Services\Legacy;

use Modules\Loyalty\Models\DiscountCard;

/**
 * Опции/цены OpenCart → manager_comment и номер дисконт-карты из oc_order_total.title.
 *
 * Цены позиций как в админке OC: price + tax (за ед.), total + tax*qty (строка).
 */
final class LegacyOrderImportExtras
{
    /**
     * @param  list<array<string, mixed>>  $totalRows
     * @return array{
     *     discount_card_id: int|null,
     *     discount_card_number: string|null,
     *     discount_percent_snapshot: string,
     *     discount_amount: string
     * }
     */
    public static function resolveDiscountFromTotals(array $totalRows): array
    {
        $empty = [
            'discount_card_id' => null,
            'discount_card_number' => null,
            'discount_percent_snapshot' => '0.00',
            'discount_amount' => '0.00',
        ];

        $cardNumber = null;
        $discountAmount = '0.00';

        foreach ($totalRows as $row) {
            $title = trim((string) ($row['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            if (preg_match('/\((\d{3,})\)/u', $title, $m) !== 1) {
                continue;
            }
            $code = trim((string) ($row['code'] ?? ''));
            $titleLower = mb_strtolower($title, 'UTF-8');
            $looksLikeDiscount = str_contains($titleLower, 'дисконт')
                || str_contains($titleLower, 'промокод')
                || str_contains($titleLower, 'скидк')
                || in_array($code, ['coupon', 'discount', 'reward', 'credit'], true);
            if (! $looksLikeDiscount) {
                continue;
            }

            $cardNumber = $m[1];
            $rawValue = (string) ($row['value'] ?? '0');
            $amount = self::absMoneyString($rawValue);
            $discountAmount = $amount;
            break;
        }

        if ($cardNumber === null) {
            return $empty;
        }

        $card = DiscountCard::query()
            ->where('card_number', $cardNumber)
            ->where('status', DiscountCard::STATUS_ACTIVE)
            ->first();

        return [
            'discount_card_id' => $card ? (int) $card->id : null,
            'discount_card_number' => $cardNumber,
            'discount_percent_snapshot' => $card
                ? self::asMoneyString((string) $card->discount_percent)
                : '0.00',
            'discount_amount' => $discountAmount,
        ];
    }

    /**
     * Полная расшифровка заказа как в админке OC → manager_comment.
     *
     * @param  list<array<string, mixed>>  $itemRows
     * @param  array<int, list<array{name: string, value: string}>>  $optionsByProduct
     * @param  list<array<string, mixed>>  $totalRows  строки oc_order_total
     */
    public static function buildManagerComment(
        array $itemRows,
        array $optionsByProduct,
        array $totalRows = [],
    ): ?string {
        $blocks = [];

        foreach ($itemRows as $item) {
            $orderProductId = (int) ($item['order_product_id'] ?? 0);
            $name = trim((string) ($item['name'] ?? ''));
            if ($name === '') {
                $name = 'Товар';
            }
            $lines = [$name];
            $opts = $optionsByProduct[$orderProductId] ?? [];
            foreach ($opts as $opt) {
                $optName = trim((string) ($opt['name'] ?? ''));
                $optValue = trim((string) ($opt['value'] ?? ''));
                if ($optName !== '' && $optValue !== '') {
                    $lines[] = '- '.$optName.': '.$optValue;
                } elseif ($optValue !== '') {
                    $lines[] = '- '.$optValue;
                } elseif ($optName !== '') {
                    $lines[] = '- '.$optName;
                }
            }

            $model = trim((string) ($item['model'] ?? ''));
            if ($model !== '') {
                $lines[] = 'Модель: '.$model;
            }

            $qty = max(1, (int) ($item['quantity'] ?? 1));
            $unitPrice = self::unitPriceWithTax($item);
            $lineTotal = self::lineTotalWithTax($item);

            $lines[] = 'Кол-во: '.$qty;
            $lines[] = 'Цена за ед.: '.self::formatMoneyRub($unitPrice);
            $lines[] = 'Всего: '.self::formatMoneyRub($lineTotal);

            $blocks[] = implode("\n", $lines);
        }

        $totalsBlock = self::formatTotalsBlock($totalRows);
        if ($totalsBlock !== null) {
            $blocks[] = $totalsBlock;
        }

        if ($blocks === []) {
            return null;
        }

        return mb_substr(implode("\n\n", $blocks), 0, 5000);
    }

    /**
     * Цена за ед. как в админке OC (price + tax).
     *
     * @param  array<string, mixed>  $item
     */
    public static function unitPriceWithTax(array $item): string
    {
        $price = self::numericString((string) ($item['price'] ?? '0'));
        $tax = self::numericString((string) ($item['tax'] ?? '0'));

        return self::asMoneyString(bcadd($price, $tax, 4));
    }

    /**
     * Сумма строки как в админке OC: total + tax * qty.
     *
     * @param  array<string, mixed>  $item
     */
    public static function lineTotalWithTax(array $item): string
    {
        $qty = max(1, (int) ($item['quantity'] ?? 1));
        $total = self::numericString((string) ($item['total'] ?? '0'));
        $tax = self::numericString((string) ($item['tax'] ?? '0'));
        $taxPart = bcmul($tax, (string) $qty, 4);

        return self::asMoneyString(bcadd($total, $taxPart, 4));
    }

    /**
     * @param  list<array<string, mixed>>  $totalRows
     */
    private static function formatTotalsBlock(array $totalRows): ?string
    {
        if ($totalRows === []) {
            return null;
        }

        usort($totalRows, static function (array $a, array $b): int {
            return ((int) ($a['sort_order'] ?? 0)) <=> ((int) ($b['sort_order'] ?? 0));
        });

        $lines = [];
        foreach ($totalRows as $row) {
            $title = trim((string) ($row['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            $value = self::numericString((string) ($row['value'] ?? '0'));
            $lines[] = $title.': '.self::formatMoneyRub($value);
        }

        if ($lines === []) {
            return null;
        }

        return implode("\n", $lines);
    }

    public static function formatMoneyRub(string $value): string
    {
        $value = self::numericString($value);
        $negative = bccomp($value, '0', 4) < 0;
        if ($negative) {
            $value = bcmul($value, '-1', 4);
        }

        $normalized = self::asMoneyString($value);
        if (str_ends_with($normalized, '.00')) {
            $normalized = substr($normalized, 0, -3);
        }

        return ($negative ? '-' : '').$normalized.' руб.';
    }

    public static function asMoneyString(string $value): string
    {
        $value = self::numericString($value);

        return bcadd($value, '0', 2);
    }

    private static function absMoneyString(string $value): string
    {
        $value = self::numericString($value);
        if (bccomp($value, '0', 4) < 0) {
            $value = bcmul($value, '-1', 4);
        }

        return self::asMoneyString($value);
    }

    private static function numericString(string $value): string
    {
        $value = trim($value);
        if ($value === '' || ! is_numeric($value)) {
            return '0';
        }

        return $value;
    }
}
