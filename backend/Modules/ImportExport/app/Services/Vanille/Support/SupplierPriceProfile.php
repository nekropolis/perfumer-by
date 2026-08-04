<?php

namespace Modules\ImportExport\Services\Vanille\Support;

use InvalidArgumentException;

/**
 * Профиль прайса поставщика (парсинг XLS): сигнатура файла, quirks колонок, хуки матчера.
 *
 * Матчинг строк (бренд, пол, объём, edp/edt, TESTER, vial≤3мл, mini, scoring) — общий
 * {@see SellerOneVariantMatcher}. Здесь только отличия поставщика без форка матчера.
 *
 * Shared (EDP + Lagdos):
 * - (U)/(M)/(L) → пол; унисекс → опция каталога 62
 * - имя / хвост варианта; ml. с точкой; TESTER → is_tester; ≤3 мл → is_vial; mini → is_miniature
 * - DB title-rules по supplier_id
 *
 * Lagdos-only:
 * - сигнатура «Прайс-лист…» + Код/Название/Цена/Заказ
 * - колонка «Заказ» не наличие
 * - ignore packaging tokens: слова упаковки убираются из extra_tokens, чтобы не ронять 100% матч
 *   (wooden/box/splash/…); на объём/пол/тестер не влияют
 */
final class SupplierPriceProfile
{
    public const CODE_EDP = 'edp';

    public const CODE_LAGDOS = 'lagdos';

    /** @deprecated Legacy code before rename migration; still accepted for resolve. */
    public const CODE_LEGACY_SELLER_ONE = 'supplier-price-xls';

    public function __construct(
        public readonly string $code,
        public readonly string $name,
    ) {
    }

    /**
     * @return list<self>
     */
    public static function all(): array
    {
        return [
            new self(self::CODE_EDP, 'EDP'),
            new self(self::CODE_LAGDOS, 'Lagdos'),
        ];
    }

    /**
     * @return list<string>
     */
    public static function codes(): array
    {
        return [self::CODE_EDP, self::CODE_LAGDOS];
    }

    public static function fromCode(string $code): self
    {
        $normalized = self::normalizeCode($code);

        return match ($normalized) {
            self::CODE_EDP => new self(self::CODE_EDP, 'EDP'),
            self::CODE_LAGDOS => new self(self::CODE_LAGDOS, 'Lagdos'),
            default => throw new InvalidArgumentException("Неизвестный поставщик прайса: {$code}"),
        };
    }

    public static function normalizeCode(string $code): string
    {
        $code = strtolower(trim($code));

        if ($code === self::CODE_LEGACY_SELLER_ONE) {
            return self::CODE_EDP;
        }

        return $code;
    }

    public function isEdp(): bool
    {
        return $this->code === self::CODE_EDP;
    }

    public function isLagdos(): bool
    {
        return $this->code === self::CODE_LAGDOS;
    }

    /**
     * Колонка «Заказ» у Lagdos — не наличие.
     */
    public function treatOrderColumnAsStock(): bool
    {
        return ! $this->isLagdos();
    }

    /**
     * Токены хвоста, которые не считаются «лишними» (extra_tokens → 95% вместо 100%).
     * Только packaging noise Lagdos; не включать mini/мини — их обрабатывает shared-парсер как миниатюру.
     *
     * @return list<string>
     */
    public function ignoreExtraTokenPatterns(): array
    {
        if (! $this->isLagdos()) {
            return [];
        }

        return [
            'splash',
            'wooden',
            'box',
            'leather',
            'case',
            'жёлтый',
            'желтый',
            'бордовый',
        ];
    }

    /**
     * @param  list<array<int, mixed>>  $rawRows
     */
    public function assertFileMatchesSignature(array $rawRows): void
    {
        $detected = self::detectSignature($rawRows);

        if ($this->isLagdos()) {
            if ($detected !== self::CODE_LAGDOS) {
                throw new InvalidArgumentException(
                    'Файл не похож на прайс Lagdos. Ожидается строка «Прайс-лист …» и заголовок Код / Название / Цена / Заказ.'
                );
            }

            return;
        }

        if ($detected === self::CODE_LAGDOS) {
            throw new InvalidArgumentException(
                'Файл похож на прайс Lagdos, а выбран поставщик EDP. Выберите Lagdos или загрузите прайс EDP.'
            );
        }

        if ($detected !== self::CODE_EDP) {
            throw new InvalidArgumentException(
                'Неверный формат прайса EDP. Ожидаются колонки: код, название, цена.'
            );
        }
    }

    /**
     * @param  list<array<int, mixed>>  $rawRows
     * @return self::CODE_EDP|self::CODE_LAGDOS|null
     */
    public static function detectSignature(array $rawRows): ?string
    {
        $scanLimit = min(8, count($rawRows));
        $hasPriceListTitle = false;
        $headerIndex = null;
        $headerHasZakaz = false;

        for ($i = 0; $i < $scanLimit; $i++) {
            $row = $rawRows[$i] ?? null;
            if (! is_array($row)) {
                continue;
            }

            $joined = '';
            foreach ($row as $cell) {
                $joined .= ' '.mb_strtolower(trim((string) $cell), 'UTF-8');
            }

            if (str_contains($joined, 'прайс-лист') || str_contains($joined, 'прайс лист')) {
                $hasPriceListTitle = true;
            }

            $first = mb_strtolower(trim((string) ($row[0] ?? '')), 'UTF-8');
            if ($first === 'код') {
                $headerIndex = $i;
                foreach ($row as $cell) {
                    $h = mb_strtolower(trim((string) $cell), 'UTF-8');
                    if ($h === 'заказ' || str_starts_with($h, 'заказ')) {
                        $headerHasZakaz = true;
                        break;
                    }
                }
            }
        }

        if ($headerIndex === null) {
            // Fallback: first data row looks like code/title/price without Lagdos markers.
            $firstData = $rawRows[0] ?? null;
            if (is_array($firstData)
                && trim((string) ($firstData[0] ?? '')) !== ''
                && trim((string) ($firstData[1] ?? '')) !== ''
            ) {
                return self::CODE_EDP;
            }

            return null;
        }

        if ($hasPriceListTitle && $headerHasZakaz) {
            return self::CODE_LAGDOS;
        }

        return self::CODE_EDP;
    }
}
