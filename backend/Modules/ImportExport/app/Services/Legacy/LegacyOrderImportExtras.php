<?php

namespace Modules\ImportExport\Services\Legacy;

use Modules\Loyalty\Models\DiscountCard;

/**
 * Опции OpenCart → manager_comment и номер дисконт-карты из oc_order_total.title.
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
            $amount = abs((float) (is_numeric($rawValue) ? $rawValue : 0));
            $discountAmount = self::asMoneyString((string) $amount);
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
     * @param  list<array<string, mixed>>  $itemRows
     * @param  array<int, list<array{name: string, value: string}>>  $optionsByProduct
     */
    public static function buildManagerComment(array $itemRows, array $optionsByProduct): ?string
    {
        if ($itemRows === []) {
            return null;
        }

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
            if (count($lines) > 1) {
                $blocks[] = implode("\n", $lines);
            }
        }

        if ($blocks === []) {
            return null;
        }

        return mb_substr(implode("\n\n", $blocks), 0, 5000);
    }

    private static function asMoneyString(string $value): string
    {
        $num = is_numeric($value) ? (string) $value : '0';

        return number_format((float) $num, 2, '.', '');
    }
}
