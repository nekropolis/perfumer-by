<?php

namespace Modules\Catalog\Services\SeoDescription;

use DOMDocument;
use DOMElement;
use DOMNode;

class ProductSeoResultValidator
{
    /** @var list<string> */
    private const ALLOWED_HTML_TAGS = ['p', 'h2', 'h3', 'ul', 'li', 'strong', 'br'];

    /**
     * @param  list<string>  $requestedFields
     * @param  array<string, mixed>  $result
     * @return array<string, string>
     */
    public function validate(array $requestedFields, array $result): array
    {
        $resultKeys = array_keys($result);
        sort($resultKeys);
        $expectedKeys = $requestedFields;
        sort($expectedKeys);
        if ($resultKeys !== $expectedKeys) {
            throw new SeoDescriptionException('SEO API result fields do not match requested fields.');
        }

        $validated = [];
        foreach ($requestedFields as $field) {
            $value = $result[$field] ?? null;
            if (! is_string($value) || trim($value) === '') {
                throw new SeoDescriptionException('SEO API result contains an empty '.$field.'.');
            }

            $value = trim($value);
            match ($field) {
                'seo_description' => $this->validatePlainText($value, 1, 160, $field),
                // SEO API часто отдаёт короче прежнего контракта 150–500; принимаем 1–500.
                'short_description' => $this->validatePlainText($value, 1, 500, $field),
                'description' => $this->validateDescription($value),
                default => throw new SeoDescriptionException('Unsupported SEO result field: '.$field.'.'),
            };
            $validated[$field] = $value;
        }

        return $validated;
    }

    /**
     * @param  array<string, mixed>  $result
     * @return array<string, string>
     */
    public function validateAvailable(array $result): array
    {
        $validated = [];
        foreach (ProductSeoPayloadBuilder::FIELDS as $field) {
            if (! array_key_exists($field, $result)) {
                continue;
            }
            $value = $result[$field];
            if (! is_string($value) || trim($value) === '') {
                throw new SeoDescriptionException('SEO API result contains an empty '.$field.'.');
            }

            $value = trim($value);
            match ($field) {
                'seo_description' => $this->validatePlainText($value, 1, 160, $field),
                // SEO API часто отдаёт короче прежнего контракта 150–500; принимаем 1–500.
                'short_description' => $this->validatePlainText($value, 1, 500, $field),
                'description' => $this->validateDescription($value),
                default => throw new SeoDescriptionException('Unsupported SEO result field: '.$field.'.'),
            };
            $validated[$field] = $value;
        }

        if ($validated === []) {
            throw new SeoDescriptionException('SEO API result has no supported fields.');
        }

        return $validated;
    }

    private function validatePlainText(string $value, int $min, int $max, string $field): void
    {
        if ($value !== strip_tags($value)) {
            throw new SeoDescriptionException('SEO API '.$field.' must be plain text.');
        }

        $length = mb_strlen($value);
        if ($length < $min || $length > $max) {
            throw new SeoDescriptionException('SEO API '.$field.' length is invalid.');
        }
    }

    private function validateDescription(string $html): void
    {
        $plainLength = mb_strlen(trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        if ($plainLength < 700 || $plainLength > 2000) {
            throw new SeoDescriptionException('SEO API description length is invalid.');
        }

        $previous = libxml_use_internal_errors(true);
        $document = new DOMDocument('1.0', 'UTF-8');
        $loaded = $document->loadHTML(
            '<?xml encoding="UTF-8"><div>'.$html.'</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD,
        );
        $errors = libxml_get_errors();
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded || $errors !== []) {
            throw new SeoDescriptionException('SEO API description contains invalid HTML.');
        }

        $root = $document->documentElement;
        if (! $root instanceof DOMElement || strtolower($root->tagName) !== 'div') {
            throw new SeoDescriptionException('SEO API description contains invalid HTML.');
        }

        foreach ($root->childNodes as $node) {
            if ($node->nodeType === XML_TEXT_NODE && trim((string) $node->nodeValue) !== '') {
                throw new SeoDescriptionException('SEO API description must contain HTML blocks only.');
            }
            $this->validateHtmlNode($node);
        }
    }

    private function validateHtmlNode(DOMNode $node): void
    {
        if ($node instanceof DOMElement) {
            if (! in_array(strtolower($node->tagName), self::ALLOWED_HTML_TAGS, true)) {
                throw new SeoDescriptionException('SEO API description contains a disallowed tag.');
            }
            if ($node->attributes->length > 0) {
                throw new SeoDescriptionException('SEO API description tags must not have attributes.');
            }
        }

        foreach ($node->childNodes as $child) {
            $this->validateHtmlNode($child);
        }
    }
}
