<?php

namespace Modules\Catalog\Services\Vanille\Parsers;

use Modules\Catalog\Services\Vanille\Support\VanilleHttpClient;

class VanilleProductParser
{
    public function __construct(
        protected VanilleHttpClient $httpClient,
    ) {
    }

    public function parseProductPage(string $url): array
    {
        $html = $this->httpClient->fetchUrl($url, 10);

        $pageTitle = $this->matchOne('/<title>(.*?)<\/title>/isu', $html);
        $name = $this->matchOne('/<h1[^>]*>(.*?)<\/h1>/isu', $html);

        $characteristics = $this->parseCharacteristics($html);
        $brand = $characteristics['Бренд'] ?? $this->extractBrandFromName($name);
        $description = $this->parseDescription($html);
        $offers = $this->parseOffers($html, $brand, $name);

        return [
            'url' => $url,
            'page_title' => $this->cleanText($pageTitle),
            'brand' => $brand,
            'name' => $this->cleanText($name),
            'characteristics' => $characteristics,
            'description' => $description,
            'offers' => $offers,
        ];
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
