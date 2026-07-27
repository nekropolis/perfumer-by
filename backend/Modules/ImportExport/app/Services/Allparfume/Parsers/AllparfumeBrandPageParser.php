<?php

namespace Modules\ImportExport\Services\Allparfume\Parsers;

use DOMDocument;
use DOMElement;
use DOMXPath;

class AllparfumeBrandPageParser
{
    /**
     * @return list<array{
     *   url:string,
     *   external_slug:string,
     *   title:string,
     *   listing_min_price:?string,
     *   listing_max_price:?string
     * }>
     */
    public function parseBrandProducts(string $html, string $brandSlug): array
    {
        $xpath = $this->createXPath($html);
        $nodes = $xpath->query("//div[contains(@class,'b-catalog-item')]");
        if ($nodes === false) {
            return [];
        }

        $items = [];
        $seen = [];

        foreach ($nodes as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            $linkNode = $xpath->query(".//a[@href][1]", $node)?->item(0);
            if (! $linkNode instanceof DOMElement) {
                continue;
            }

            $href = trim((string) $linkNode->getAttribute('href'));
            if ($href === '' || ! str_contains($href, "/{$brandSlug}/") || ! str_ends_with($href, '.html')) {
                continue;
            }

            $externalSlug = $this->extractExternalSlug($href);
            if ($externalSlug === '' || isset($seen[$href])) {
                continue;
            }

            $seen[$href] = true;
            $title = trim($xpath->evaluate("string(.//span[contains(@class,'b-catalog-item-caption__price')][1])", $node));
            $rangeText = trim($xpath->evaluate("string(.//span[contains(@class,'dub-pr-range')][1])", $node));
            [$listingMinPrice, $listingMaxPrice] = $this->parsePriceRange($rangeText);

            $items[] = [
                'url' => $href,
                'external_slug' => $externalSlug,
                'title' => $this->normalizeWhitespace($title),
                'listing_min_price' => $listingMinPrice,
                'listing_max_price' => $listingMaxPrice,
            ];
        }

        return $items;
    }

    /**
     * @return array{0:?string,1:?string}
     */
    private function parsePriceRange(string $value): array
    {
        if (! preg_match('/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/u', $value, $match)) {
            return [null, null];
        }

        return [
            $this->normalizeDecimalString($match[1]),
            $this->normalizeDecimalString($match[2]),
        ];
    }

    private function extractExternalSlug(string $href): string
    {
        $path = parse_url($href, PHP_URL_PATH);
        if (! is_string($path) || trim($path) === '') {
            return '';
        }

        $slug = basename($path, '.html');

        return trim($slug);
    }

    private function createXPath(string $html): DOMXPath
    {
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="UTF-8">'.$html);

        return new DOMXPath($dom);
    }

    private function normalizeWhitespace(string $value): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    private function normalizeDecimalString(string $value): ?string
    {
        $normalized = str_replace(',', '.', trim($value));
        if ($normalized === '' || ! is_numeric($normalized)) {
            return null;
        }

        return number_format((float) $normalized, 2, '.', '');
    }
}
