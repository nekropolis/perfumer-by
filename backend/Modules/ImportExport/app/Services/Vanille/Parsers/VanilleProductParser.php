<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

use Modules\ImportExport\Services\Vanille\Support\VanilleHttpClient;

class VanilleProductParser
{
    public function __construct(
        protected VanilleHttpClient $httpClient,
    ) {
    }

    public function parseProductPage(string $url): array
    {
        $html = $this->httpClient->fetchUrl($url, 25);

        $pageTitle = $this->matchOne('/<title>(.*?)<\/title>/isu', $html);
        $name = $this->matchOne('/<h1[^>]*>(.*?)<\/h1>/isu', $html);

        $characteristics = $this->parseCharacteristics($html);
        $brand = $characteristics['Бренд'] ?? $this->extractBrandFromName($name);
        $description = $this->parseDescription($html);
        $offers = $this->parseOffers($html, $brand, $name);
        $defaultType = is_string($characteristics['Типы'] ?? null)
            ? trim((string) $characteristics['Типы'])
            : '';
        $barcodeOffers = $this->parseBarcodeVolumeOffers($html, $defaultType);
        $offers = $this->mergeOffersByVolumeKey($offers, $barcodeOffers);

        return [
            'url' => $url,
            'page_title' => $this->cleanText($pageTitle),
            'brand' => $brand,
            'name' => $this->cleanText($name),
            'characteristics' => $characteristics,
            'description' => $description,
            'offers' => $offers,
            'gallery_image_urls' => $this->extractGalleryImageUrls($html),
        ];
    }

    /**
     * @return list<string>
     */
    public function parseGalleryImageUrlsFromHtml(string $html): array
    {
        return $this->extractGalleryImageUrls($html);
    }

    /**
     * @return list<string>
     */
    protected function extractGalleryImageUrls(string $html): array
    {
        $urls = [];

        // 1) Точные источники галереи на карточке товара (main + thumbs + zoom):
        if (preg_match('/<div[^>]+class="[^"]*product-photo[^"]*"[^>]*>(.*?)<\/div>\s*<div/isu', $html, $photoScope)) {
            $scope = $photoScope[1];

            if (preg_match_all('/<a[^>]+class="[^"]*product-photo__thumb-item[^"]*"[^>]+href="([^"]+)"/iu', $scope, $thumbLinks)) {
                foreach ($thumbLinks[1] as $u) {
                    $urls[] = $this->normalizeVanilleImageUrl((string) $u);
                }
            }

            if (preg_match_all('/<a[^>]+class="[^"]*product-photo__item--lg[^"]*"[^>]+href="([^"]+)"/iu', $scope, $mainLinks)) {
                foreach ($mainLinks[1] as $u) {
                    $urls[] = $this->normalizeVanilleImageUrl((string) $u);
                }
            }

            if (preg_match_all('/data-zoom-image="([^"]+)"/iu', $scope, $zoom)) {
                foreach ($zoom[1] as $u) {
                    $urls[] = $this->normalizeVanilleImageUrl((string) $u);
                }
            }
        }

        // 2) Безопасный fallback, если photo-блок не найден (старый шаблон):
        if ($urls === [] && preg_match_all('/<img[^>]+(?:src|data-src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/iu', $html, $imgs)) {
            foreach ($imgs[1] as $u) {
                $urls[] = $this->normalizeVanilleImageUrl((string) $u);
            }
        }

        $urls = array_values(array_unique(array_filter($urls, function (string $url): bool {
            if (! str_contains($url, '/assets/images/products/')) {
                return false;
            }
            if (preg_match('/(logo|icon|sprite|payment|banner|pixel|social)/iu', $url)) {
                return false;
            }

            return true;
        })));

        usort($urls, static function (string $a, string $b): int {
            $aScore = (int) str_contains($a, '/largewebp/') * 3 + (int) str_contains($a, '/large/') * 2;
            $bScore = (int) str_contains($b, '/largewebp/') * 3 + (int) str_contains($b, '/large/') * 2;

            return $bScore <=> $aScore;
        });

        return array_slice($urls, 0, 8);
    }

    protected function normalizeVanilleImageUrl(string $url): string
    {
        $url = html_entity_decode(trim($url), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($url === '') {
            return '';
        }
        if (str_starts_with($url, '//')) {
            return 'https:'.$url;
        }
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }
        if (str_starts_with($url, '/')) {
            return 'https://vanille.by'.$url;
        }

        return 'https://vanille.by/'.$url;
    }

    protected function parseCharacteristics(string $html): array
    {
        $data = [];

        preg_match_all('/<tr[^>]*itemprop="additionalProperty"[^>]*>(.*?)<\/tr>/isu', $html, $rows);

        foreach ($rows[1] as $rowHtml) {
            if (!preg_match('/<span itemprop="name">(.*?)<\/span>/isu', $rowHtml, $keyMatch)) {
                continue;
            }

            $key = $this->cleanText($keyMatch[1]);

            preg_match_all('/<span[^>]*itemprop="value"[^>]*>(.*?)<\/span>/isu', $rowHtml, $valueMatches);
            $values = [];

            foreach ($valueMatches[1] as $rawValue) {
                $value = $this->cleanText($rawValue);
                if ($value !== '') {
                    $values[] = $value;
                }
            }

            if ($key !== '') {
                $data[$key] = implode(', ', $values);
            }
        }

        return $data;
    }

    protected function parseDescription(string $html): string
    {
        if (!preg_match('/<div itemprop="description" class="select">(.*?)<\/div>\s*<!--noindex-->/isu', $html, $match)) {
            return '';
        }

        return $this->cleanText($match[1]);
    }

    protected function parseOffers(string $html, string $brand, string $name): array
    {
        $offers = [];
        $marker = 'itemprop="offers" itemscope itemtype="https://schema.org/Offer"';

        preg_match_all('/' . preg_quote($marker, '/') . '/u', $html, $matches, PREG_OFFSET_CAPTURE);
        $positions = array_map(fn($m) => $m[1], $matches[0]);

        foreach ($positions as $index => $pos) {
            $start = strrpos(substr($html, 0, $pos), '<div');
            $end = $positions[$index + 1] ?? strpos($html, '<div class="product-intro__section">', $pos);

            if ($start === false) {
                $start = $pos;
            }

            if ($end === false) {
                $end = $pos + 3000;
            }

            $block = substr($html, $start, $end - $start);

            preg_match('/<meta itemprop="price" content="([^"]+)"/isu', $block, $priceMatch);

            $inputStart = strpos($block, '<input');
            $attrs = [];

            if ($inputStart !== false) {
                $tag = $this->extractTag($block, $inputStart);
                $attrs = $this->parseAttrs($tag);
            }

            $variant = $attrs['value'] ?? $this->matchOne('/<span class="price-title">(.*?)<\/span>/isu', $block);
            $type = $attrs['data-tip'] ?? $this->matchOne('/<span class="price-tip">(.*?)<\/span>/isu', $block);

            $variant = $this->cleanText($variant);
            $type = $this->cleanText($type);

            if (str_contains(mb_strtolower($variant), 'отливант') || str_contains(mb_strtolower($type), 'отливант')) {
                continue;
            }

            $title = $attrs['data-title'] ?? '';
            $title = $this->cleanText($title);

            if ($title === '') {
                $baseName = $name;

                if ($brand !== '' && str_starts_with(mb_strtolower($name), mb_strtolower($brand . ' '))) {
                    $baseName = trim(mb_substr($name, mb_strlen($brand)));
                }

                $title = trim(implode(' ', array_filter([$brand, $baseName, $variant, $type])));
            }

            $offers[] = [
                'variant' => $variant,
                'type' => $type,
                'title' => $title,
                'article' => $attrs['data-article'] ?? '',
                'price_byn' => $priceMatch[1] ?? $this->cleanText($attrs['data-price'] ?? ''),
                'old_price' => $this->cleanText($attrs['data-oldprice'] ?? ''),
                'stock_flag' => $attrs['data-stock'] ?? '',
                'sale_flag' => $attrs['data-sale'] ?? '',
                'shop_flag' => $attrs['data-shop'] ?? '',
            ];
        }

        return $offers;
    }

    /**
     * Объёмы из таблицы штрих-кодов (есть даже если нет в наличии на витрине).
     *
     * @return list<array<string, string>>
     */
    protected function parseBarcodeVolumeOffers(string $html, string $defaultType): array
    {
        if (!preg_match_all('/<td class="barcode">(.*?)<\/td>\s*<td>(\d+)<\/td>/isu', $html, $rows, PREG_SET_ORDER)) {
            return [];
        }

        $offers = [];

        foreach ($rows as $row) {
            $label = $this->cleanText(preg_replace('/<[^>]+>/u', ' ', $row[1]) ?? $row[1]);
            if (!preg_match('/(\d+(?:[.,]\d+)?)\s*мл/iu', $label, $volumeMatch)) {
                continue;
            }

            $volume = (int) round((float) str_replace(',', '.', $volumeMatch[1]));
            $type = $defaultType;
            if (preg_match('/(?:^|\s)(парфюмерная вода|туалетная вода|одеколон|духи)/iu', $label, $typeMatch)) {
                $type = $this->cleanText($typeMatch[1]);
            }

            $offers[] = [
                'variant' => $volume . ' мл',
                'type' => $type,
                'title' => '',
                'article' => $this->cleanText($row[2]),
                'price_byn' => '',
                'old_price' => '',
                'stock_flag' => '',
                'sale_flag' => '',
                'shop_flag' => '',
            ];
        }

        return $offers;
    }

    /**
     * @param  list<array<string, string>>  $primary
     * @param  list<array<string, string>>  $secondary
     * @return list<array<string, string>>
     */
    protected function mergeOffersByVolumeKey(array $primary, array $secondary): array
    {
        $seen = [];
        foreach ($primary as $offer) {
            $key = $this->offerVolumeKey($offer);
            if ($key !== '') {
                $seen[$key] = true;
            }
        }

        $merged = $primary;
        foreach ($secondary as $offer) {
            $key = $this->offerVolumeKey($offer);
            if ($key === '' || isset($seen[$key])) {
                continue;
            }
            $merged[] = $offer;
            $seen[$key] = true;
        }

        return $merged;
    }

    /**
     * @param  array<string, string>  $offer
     */
    protected function offerVolumeKey(array $offer): string
    {
        $text = mb_strtolower(trim(((string) ($offer['variant'] ?? '')) . ' ' . ((string) ($offer['type'] ?? ''))));
        if (!preg_match('/(\d+(?:[.,]\d+)?)\s*мл/u', $text, $match)) {
            return '';
        }

        $ml = (int) round((float) str_replace(',', '.', $match[1]));
        $type = mb_strtolower(trim((string) ($offer['type'] ?? '')));

        return $ml . '|' . $type;
    }

    protected function parseAttrs(string $tag): array
    {
        $attrs = [];
        preg_match_all('/([a-zA-Z0-9_:-]+)="([^"]*)"/u', $tag, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            $attrs[$match[1]] = $this->cleanText($match[2]);
        }

        return $attrs;
    }

    protected function extractTag(string $html, int $start): string
    {
        $inQuote = false;
        $length = strlen($html);

        for ($i = $start; $i < $length; $i++) {
            $char = $html[$i];

            if ($char === '"') {
                $inQuote = !$inQuote;
            } elseif ($char === '>' && !$inQuote) {
                return substr($html, $start, $i - $start + 1);
            }
        }

        return substr($html, $start);
    }

    protected function matchOne(string $pattern, string $html): string
    {
        return preg_match($pattern, $html, $match) ? $match[1] : '';
    }

    protected function cleanText(string $value): string
    {
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = strip_tags($value);
        $value = preg_replace('/\s+/u', ' ', $value);

        return trim($value);
    }

    protected function extractBrandFromName(string $name): string
    {
        $parts = preg_split('/\s+/u', trim($name));
        return $parts[0] ?? '';
    }
}
