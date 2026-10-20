<?php

namespace Modules\ImportExport\Support\ElParfume;

class ElParfumeNormalizer
{
    /** х→h. Latin digraph kh is folded to h in foldLatinKh(). */
    private const CYRILLIC_TO_LATIN_H = [
        'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'e',
        'ж' => 'zh', 'з' => 'z', 'и' => 'i', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm',
        'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't', 'у' => 'u',
        'ф' => 'f', 'х' => 'h', 'ц' => 'ts', 'ч' => 'ch', 'ш' => 'sh', 'щ' => 'shch',
        'ъ' => '', 'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
        'і' => 'i', 'ї' => 'yi', 'є' => 'ye', 'ґ' => 'g', 'ў' => 'u',
    ];

    private const NOISE_LATIN = [
        'edt', 'edp', 'edc', 'parfum', 'eau', 'de', 'toilette', 'cologne', 'tester', 'original',
    ];

    private const NOISE_CYRILLIC = [
        'туалетная', 'парфюмерная', 'вода', 'духи', 'одеколон', 'тестер', 'оригинал',
    ];

    /** @var array<string, true> */
    private array $noise = [];

    public function __construct()
    {
        $this->noise = array_fill_keys(self::NOISE_LATIN, true);
        foreach (self::NOISE_CYRILLIC as $word) {
            $token = $this->latinFold($word);
            if ($token !== '') {
                $this->noise[$token] = true;
            }
        }
    }

    /**
     * @return array{spaced:string,sorted:string,compact:string,tokens:list<string>}
     */
    public function normalize(string $text): array
    {
        $text = trim($text);
        if ($text === '') {
            return $this->emptySignal();
        }

        $value = $this->latinFold($text);
        $value = preg_replace('/[^a-z0-9]+/', ' ', $value) ?? $value;
        $value = trim($value);
        if ($value === '') {
            return $this->emptySignal();
        }

        $raw = preg_split('/\s+/', $value) ?: [];
        $ordered = [];
        $count = count($raw);
        for ($i = 0; $i < $count; $i++) {
            $token = $raw[$i];
            if ($token === '' || isset($this->noise[$token])) {
                continue;
            }
            if (preg_match('/^\d+ml$/', $token) === 1 || $token === 'ml') {
                continue;
            }
            if (preg_match('/^\d+$/', $token) === 1 && ($raw[$i + 1] ?? '') === 'ml') {
                continue;
            }
            $ordered[] = $token;
        }

        return $this->pack($ordered);
    }

    /**
     * @param  array{spaced:string,sorted:string,compact:string,tokens:list<string>}  $signal
     * @param  array<string, true>  $drop
     * @return array{spaced:string,sorted:string,compact:string,tokens:list<string>}
     */
    public function withoutTokens(array $signal, array $drop): array
    {
        if ($drop === [] || $signal['spaced'] === '') {
            return $signal;
        }

        $kept = [];
        foreach (explode(' ', $signal['spaced']) as $token) {
            if ($token === '' || isset($drop[$token])) {
                continue;
            }
            $kept[] = $token;
        }

        return $this->pack($kept);
    }

    public function stripTrailingIdSuffix(string $keyword): string
    {
        $keyword = trim($keyword);
        $stripped = preg_replace('/-\d+$/', '', $keyword);

        return is_string($stripped) ? $stripped : $keyword;
    }

    public function stripCategoryKeyword(string $keyword): string
    {
        $keyword = str_replace('\\', '/', trim($keyword));
        $parts = array_values(array_filter(
            explode('/', trim($keyword, '/')),
            static fn (string $part): bool => $part !== '',
        ));
        $leaf = $parts === [] ? '' : $parts[array_key_last($parts)];
        $previous = null;
        while ($leaf !== $previous) {
            $previous = $leaf;
            $next = preg_replace('/-(?:myjskie|jenskie|zhenskie|muzhskie|w|m|\d+)$/iu', '', $leaf);
            $leaf = is_string($next) ? $next : $leaf;
        }

        return $leaf;
    }

    /**
     * @param  list<string>  $ordered
     * @return array{spaced:string,sorted:string,compact:string,tokens:list<string>}
     */
    private function pack(array $ordered): array
    {
        $sequence = [];
        $seen = [];
        foreach ($ordered as $token) {
            if ($token === '' || isset($seen[$token])) {
                continue;
            }
            $seen[$token] = true;
            $sequence[] = $token;
        }

        $sorted = $sequence;
        sort($sorted, SORT_STRING);

        return [
            'spaced' => implode(' ', $sequence),
            'sorted' => implode(' ', $sorted),
            'compact' => implode('', $sequence),
            'tokens' => $sorted,
        ];
    }

    /**
     * @return array{spaced:string,sorted:string,compact:string,tokens:list<string>}
     */
    private function emptySignal(): array
    {
        return [
            'spaced' => '',
            'sorted' => '',
            'compact' => '',
            'tokens' => [],
        ];
    }

    private function latinFold(string $text): string
    {
        $value = mb_strtolower($text, 'UTF-8');
        $value = strtr($value, self::CYRILLIC_TO_LATIN_H);

        return $this->foldLatinKh($this->stripMarks($value));
    }

    private function stripMarks(string $value): string
    {
        if (class_exists(\Normalizer::class)) {
            $decomposed = \Normalizer::normalize($value, \Normalizer::FORM_D);
            if (is_string($decomposed)) {
                $stripped = preg_replace('/\p{M}+/u', '', $decomposed);
                if (is_string($stripped)) {
                    $value = $stripped;
                }
            }
        }

        if (preg_match('/[^\x00-\x7F]/', $value) === 1) {
            $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
            if (is_string($ascii) && $ascii !== '') {
                $value = $ascii;
            }
            $value = preg_replace('/[^\x00-\x7F]/', '', $value) ?? $value;
        }

        return $value;
    }

    private function foldLatinKh(string $value): string
    {
        return str_replace('kh', 'h', $value);
    }
}
