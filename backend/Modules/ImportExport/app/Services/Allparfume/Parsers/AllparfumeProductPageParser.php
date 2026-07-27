<?php

namespace Modules\ImportExport\Services\Allparfume\Parsers;

use DOMDocument;
use DOMElement;
use DOMXPath;

class AllparfumeProductPageParser
{
    /**
     * @return array{
     *   title:string,
     *   brand_name:?string,
     *   name:string,
     *   gender_label:?string,
     *   parfume_id:?string,
     *   volume_cards:list<array<string,mixed>>,
     *   variants:list<array<string,mixed>>
     * }
     */
    public function parseProductPage(string $html, string $url): array
    {
        $xpath = $this->createXPath($html);
        $title = $this->normalizeWhitespace($xpath->evaluate("string(//h1[1])"));
        [$brandName, $name] = $this->splitBrandAndName($title);

        return [
            'title' => $title,
            'brand_name' => $brandName,
            'name' => $name,
            'gender_label' => $this->detectGenderLabel($html),
            'parfume_id' => $this->parseParfumeId($xpath),
            'volume_cards' => $this->parseVolumeCards($xpath),
            'variants' => $this->parseVariantMinimums($xpath),
        ];
    }

    /**
     * @return list<array{
     *   raw_label:string,
     *   variant_key:string,
     *   volume_ml:?string,
     *   concentration_code:?string,
     *   is_tester:bool,
     *   is_vial:bool,
     *   is_miniature:bool,
     *   min_price:?string,
     *   payload:array<string,mixed>
     * }>
     */
    public function parseVariantMinimums(DOMXPath $xpath): array
    {
        $rows = $xpath->query("//table[contains(@class,'d-price-tbl-ggl')]//tr[position()>1]");
        if ($rows === false) {
            return [];
        }

        $result = [];
        foreach ($rows as $row) {
            if (! $row instanceof DOMElement) {
                continue;
            }

            $label = $this->normalizeVariantDisplayLabel(
                $this->normalizeWhitespace($xpath->evaluate("string(.//td[1]//span[1])", $row))
            );
            $price = $this->normalizeMoney($xpath->evaluate("string(.//td[2])", $row));
            if ($label === '') {
                $fullCell = $this->normalizeWhitespace($xpath->evaluate("string(.//td[1])", $row));
                $label = $this->normalizeVariantDisplayLabel($this->extractParenthesizedLabel($fullCell) ?? $fullCell);
            }

            $result[] = $this->buildVariantRow(
                $label,
                $price,
                [
                    'label_full' => $this->normalizeWhitespace($xpath->evaluate("string(.//td[1])", $row)),
                    'price_raw' => $this->normalizeWhitespace($xpath->evaluate("string(.//td[2])", $row)),
                    'source' => 'min_price_table',
                ],
            );
        }

        return $result;
    }

    /**
     * Volume cards used by allparfume AJAX (`card-click` = img alt).
     *
     * @return list<array{
     *   card_click:string,
     *   raw_label:string,
     *   variant_key:string,
     *   volume_ml:?string,
     *   concentration_code:?string,
     *   is_tester:bool,
     *   is_vial:bool,
     *   is_miniature:bool
     * }>
     */
    public function parseVolumeCards(DOMXPath $xpath): array
    {
        $nodes = $xpath->query("//div[starts-with(@id,'card-')]");
        if ($nodes === false) {
            return [];
        }

        $result = [];
        $seen = [];
        foreach ($nodes as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            $cardClick = $this->normalizeWhitespace(
                $xpath->evaluate("string(.//div[contains(@class,'front')][1]//img[1]/@alt)", $node)
            );
            if ($cardClick === '') {
                $cardClick = $this->normalizeWhitespace(
                    $xpath->evaluate("string(.//img[1]/@alt)", $node)
                );
            }
            if ($cardClick === '' || isset($seen[$cardClick])) {
                continue;
            }
            $seen[$cardClick] = true;

            $title = $this->normalizeWhitespace(
                $xpath->evaluate("string(.//div[contains(@class,'front')][1]/@title)", $node)
            );
            $label = $title !== '' ? $this->normalizeVariantDisplayLabel($title) : $cardClick;
            $normalized = $this->normalizeVariantLabel($label);

            $result[] = [
                'card_click' => $cardClick,
                'raw_label' => $label,
                'variant_key' => $this->buildVariantKey($normalized, $label),
                'volume_ml' => $normalized['volume_ml'],
                'concentration_code' => $normalized['concentration_code'],
                'is_tester' => $normalized['is_tester'],
                'is_vial' => $normalized['is_vial'],
                'is_miniature' => $normalized['is_miniature'],
            ];
        }

        return $result;
    }

    public function parseParfumeId(DOMXPath $xpath): ?string
    {
        $value = trim((string) $xpath->evaluate("string(//input[@id='parfume-id' or @name='parfume-id'][1]/@value)"));
        if ($value === '') {
            $value = trim((string) $xpath->evaluate("string(//input[@name='parf_id'][1]/@value)"));
        }

        return $value !== '' ? $value : null;
    }

    /**
     * @return list<array{
     *   shop_key:string,
     *   shop_name:string,
     *   shop_url:?string,
     *   offer_url:?string,
     *   offer_url_hash:?string,
     *   price:?string,
     *   old_price:?string,
     *   delivery_text:?string,
     *   payload:array<string,mixed>
     * }>
     */
    public function parseShopOffersFromHtml(string $html, string $pageUrl): array
    {
        return $this->parseShopOffers($this->createXPath($html), $pageUrl);
    }

    /**
     * @return list<array{
     *   shop_key:string,
     *   shop_name:string,
     *   shop_url:?string,
     *   offer_url:?string,
     *   offer_url_hash:?string,
     *   price:?string,
     *   old_price:?string,
     *   delivery_text:?string,
     *   payload:array<string,mixed>
     * }>
     */
    public function parseShopOffers(DOMXPath $xpath, string $pageUrl): array
    {
        $rows = $xpath->query("//table[contains(@class,'shopping-cart-table')]//tr");
        if ($rows === false) {
            return [];
        }

        $result = [];
        foreach ($rows as $row) {
            if (! $row instanceof DOMElement) {
                continue;
            }

            $price = $this->normalizeMoney($xpath->evaluate("string(.//span[contains(@class,'tbl-price')][1])", $row));
            $delivery = $this->normalizeWhitespace($xpath->evaluate("string(.//span[contains(@class,'delivery')][1])", $row));
            $shopName = $this->normalizeWhitespace($this->directTextContent($this->tdAt($xpath, $row, 3)));
            $offerHref = $this->normalizeUrl($xpath->evaluate("string(.//td[3]//a[contains(@class,'out_link')][1]/@href)", $row), $pageUrl);
            $shopHref = $this->normalizeUrl($xpath->evaluate("string(.//td[2]//a[1]/@href)", $row), $pageUrl);

            if ($shopName === '' || $price === null) {
                continue;
            }

            $row = [
                'shop_key' => $this->slugify($shopName),
                'shop_name' => $shopName,
                'shop_url' => $shopHref,
                'offer_url' => $offerHref,
                'offer_url_hash' => $offerHref !== null ? sha1($offerHref) : null,
                'price' => $price,
                'old_price' => null,
                'delivery_text' => $delivery !== '' ? $delivery : null,
                'payload' => [
                    'price_raw' => $this->normalizeWhitespace($xpath->evaluate("string(.//span[contains(@class,'tbl-price')][1])", $row)),
                    'shop_row_text' => $this->normalizeWhitespace($row->textContent),
                ],
            ];

            if (\Modules\ImportExport\Services\Allparfume\Support\AllparfumeOwnShopFilter::isOwnShop($row)) {
                continue;
            }

            $result[] = $row;
        }

        return $result;
    }

    /**
     * @param  array<string,mixed>  $payload
     * @return array{
     *   raw_label:string,
     *   variant_key:string,
     *   volume_ml:?string,
     *   concentration_code:?string,
     *   is_tester:bool,
     *   is_vial:bool,
     *   is_miniature:bool,
     *   min_price:?string,
     *   payload:array<string,mixed>
     * }
     */
    public function buildVariantRow(string $label, ?string $minPrice = null, array $payload = []): array
    {
        $normalized = $this->normalizeVariantLabel($label);

        return [
            'raw_label' => $label,
            'variant_key' => $this->buildVariantKey($normalized, $label),
            'volume_ml' => $normalized['volume_ml'],
            'concentration_code' => $normalized['concentration_code'],
            'is_tester' => $normalized['is_tester'],
            'is_vial' => $normalized['is_vial'],
            'is_miniature' => $normalized['is_miniature'],
            'min_price' => $minPrice,
            'payload' => $payload,
        ];
    }

    /**
     * @return array{0:?string,1:string}
     */
    private function splitBrandAndName(string $title): array
    {
        $clean = $this->normalizeWhitespace($title);
        if (! str_contains($clean, ' - ')) {
            return [null, $clean];
        }

        [$brandName, $name] = explode(' - ', $clean, 2);

        return [
            $this->normalizeWhitespace($brandName),
            $this->normalizeWhitespace($name),
        ];
    }

    private function detectGenderLabel(string $html): ?string
    {
        $normalized = mb_strtolower($html);
        if (str_contains($normalized, 'alt="мужской аромат"')) {
            return 'male';
        }
        if (str_contains($normalized, 'alt="женский аромат"')) {
            return 'female';
        }
        if (str_contains($normalized, 'alt="аромат унисекс"')) {
            return 'unisex';
        }

        return null;
    }

    /**
     * @return array{
     *   volume_ml:?string,
     *   concentration_code:?string,
     *   is_tester:bool,
     *   is_vial:bool,
     *   is_miniature:bool
     * }
     */
    private function normalizeVariantLabel(string $label): array
    {
        $normalized = mb_strtolower($this->normalizeWhitespace(trim($label, '()')));
        preg_match('/(\d+(?:[.,]\d+)?)\s*(?:ml|мл)\b/u', $normalized, $volumeMatch);

        $volumeMl = null;
        if (isset($volumeMatch[1])) {
            $volumeMl = number_format((float) str_replace(',', '.', $volumeMatch[1]), 1, '.', '');
        }

        $isTester = str_contains($normalized, 'тестер') || str_contains($normalized, 'tester');
        $isVial = str_contains($normalized, 'отливант') || str_contains($normalized, 'vial');
        $isMiniature = str_contains($normalized, 'миниат');
        $concentrationCode = null;

        if (preg_match('/\bextrait de parfum\b|\bextrait\b/u', $normalized)) {
            $concentrationCode = 'extrait de parfum';
        } elseif (preg_match('/\bпарфюмированная вода\b|\bпарфюмерная вода\b|\bedp\b/u', $normalized)) {
            $concentrationCode = 'edp';
        } elseif (preg_match('/\bтуалетная вода\b|\bedt\b/u', $normalized)) {
            $concentrationCode = 'edt';
        } elseif (preg_match('/\bодеколон\b|\bedc\b/u', $normalized)) {
            $concentrationCode = 'edc';
        } elseif (preg_match('/\bparfum\b|\bдухи\b/u', $normalized)) {
            $concentrationCode = 'parfum';
        }

        if (! $isVial && ! $isMiniature && $volumeMl !== null && (float) $volumeMl <= 3.0) {
            $isVial = true;
        }

        return [
            'volume_ml' => $volumeMl,
            'concentration_code' => $concentrationCode,
            'is_tester' => $isTester,
            'is_vial' => $isVial,
            'is_miniature' => $isMiniature,
        ];
    }

    /**
     * @param  array{volume_ml:?string,concentration_code:?string,is_tester:bool,is_vial:bool,is_miniature:bool}  $normalized
     */
    private function buildVariantKey(array $normalized, string $rawLabel): string
    {
        $parts = [
            $normalized['volume_ml'] ?? 'na',
            $normalized['concentration_code'] ?? 'na',
            $normalized['is_tester'] ? 'tester' : 'std',
            $normalized['is_vial'] ? 'vial' : 'novial',
            $normalized['is_miniature'] ? 'mini' : 'nomini',
        ];

        $key = implode('|', $parts);
        if ($key === 'na|na|std|novial|nomini') {
            return 'raw:'.sha1($rawLabel);
        }

        return $key;
    }

    private function tdAt(DOMXPath $xpath, DOMElement $row, int $position): ?DOMElement
    {
        $td = $xpath->query("./td[{$position}]", $row)?->item(0);

        return $td instanceof DOMElement ? $td : null;
    }

    private function directTextContent(?DOMElement $element): string
    {
        if (! $element instanceof DOMElement) {
            return '';
        }

        $parts = [];
        foreach ($element->childNodes as $child) {
            if ($child->nodeType === XML_TEXT_NODE) {
                $parts[] = $child->textContent ?? '';
            }
        }

        return $this->normalizeWhitespace(implode(' ', $parts));
    }

    private function extractParenthesizedLabel(string $value): ?string
    {
        if (! preg_match('/\(([^)]+)\)/u', $value, $match)) {
            return null;
        }

        return $this->normalizeWhitespace($match[1]);
    }

    private function normalizeVariantDisplayLabel(string $value): string
    {
        return $this->normalizeWhitespace(trim($value, " \t\n\r\0\x0B()"));
    }

    private function normalizeUrl(string $value, string $pageUrl): ?string
    {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        if (str_starts_with($trimmed, 'http://') || str_starts_with($trimmed, 'https://')) {
            return $trimmed;
        }

        $parts = parse_url($pageUrl);
        $scheme = (string) ($parts['scheme'] ?? 'https');
        $host = (string) ($parts['host'] ?? 'allparfume.by');

        if (str_starts_with($trimmed, '/')) {
            return "{$scheme}://{$host}{$trimmed}";
        }

        return "{$scheme}://{$host}/".ltrim($trimmed, './');
    }

    private function normalizeMoney(string $value): ?string
    {
        if (! preg_match('/(\d+(?:[.,]\d+)?)/u', $value, $match)) {
            return null;
        }

        return number_format((float) str_replace(',', '.', $match[1]), 2, '.', '');
    }

    private function normalizeWhitespace(string $value): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    private function slugify(string $value): string
    {
        $normalized = mb_strtolower($this->normalizeWhitespace($value), 'UTF-8');
        $normalized = preg_replace('/[^a-z0-9а-яё]+/iu', '-', $normalized) ?? '';

        return trim($normalized, '-');
    }

    private function createXPath(string $html): DOMXPath
    {
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="UTF-8">'.$html);

        return new DOMXPath($dom);
    }
}
