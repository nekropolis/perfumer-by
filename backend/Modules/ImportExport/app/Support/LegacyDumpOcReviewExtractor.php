<?php

namespace Modules\ImportExport\Support;

/**
 * Parses `INSERT INTO oc_review` blocks from an OpenCart SQL dump.
 *
 * @phpstan-type LegacyReviewRow array{
 *   legacy_review_id:int, legacy_product_id:int, legacy_customer_id:int, author:string, body:string,
 *   stars:int, legacy_status:int, created_at:?string, updated_at:?string, reply_text:?string, replied_at:?string
 * }
 */
final class LegacyDumpOcReviewExtractor
{
    /**
     * DB JSON column may arrive as string, array, or stdClass depending on driver/config.
     *
     * @return list<array<string, mixed>>
     */
    public static function decodeStagedReviewsJson(mixed $value): array
    {
        if (is_array($value)) {
            return array_values($value);
        }
        if (is_object($value)) {
            $decoded = json_decode(json_encode($value, JSON_UNESCAPED_UNICODE), true);

            return is_array($decoded) ? array_values($decoded) : [];
        }
        $decoded = json_decode((string) ($value ?? '[]'), true);

        return is_array($decoded) ? array_values($decoded) : [];
    }

    /**
     * @return list<LegacyReviewRow>
     */
    public function extractAll(string $dumpPath): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $result = [];
        $inInsert = false;
        $statement = '';
        $inQuote = false;
        $escaped = false;

        while (($line = fgets($handle)) !== false) {
            if (! $inInsert) {
                if (str_starts_with($line, 'INSERT INTO `oc_review`')) {
                    $inInsert = true;
                    $statement = $line;
                    $inQuote = false;
                    $escaped = false;
                }
                continue;
            }

            $statement .= $line;
            if (! $this->lineEndsSqlStatement($line, $inQuote, $escaped)) {
                continue;
            }

            $valuesPos = stripos($statement, 'VALUES');
            if ($valuesPos !== false) {
                $valuesSql = substr($statement, $valuesPos + 6);
                $tuples = $this->splitSqlTuples($valuesSql);
                foreach ($tuples as $tuple) {
                    $fields = $this->splitTupleFields($tuple);
                    if (count($fields) < 9) {
                        continue;
                    }

                    $parsedBody = $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[4])) ?? '');
                    $parsedReply = isset($fields[9])
                        ? $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[9])) ?? '')
                        : null;
                    [$reviewBody, $replyFromBody] = $this->splitReviewAndReplyFromBody($parsedBody);
                    $replyText = trim((string) ($parsedReply ?? '')) !== ''
                        ? trim((string) $parsedReply)
                        : $replyFromBody;

                    $result[] = [
                        'legacy_review_id' => (int) trim($fields[0]),
                        'legacy_product_id' => (int) trim($fields[1]),
                        'legacy_customer_id' => (int) trim($fields[2]),
                        'author' => $this->decodeLegacyHtml($this->unquoteSqlString(trim($fields[3])) ?? ''),
                        'body' => $reviewBody,
                        'stars' => max(1, min(5, (int) trim($fields[5]))),
                        'legacy_status' => (int) trim($fields[6]),
                        'created_at' => $this->nullableDateTime($this->unquoteSqlString(trim($fields[7]))),
                        'updated_at' => $this->nullableDateTime($this->unquoteSqlString(trim($fields[8]))),
                        'reply_text' => $replyText !== '' ? $replyText : null,
                        'replied_at' => isset($fields[10])
                            ? $this->nullableDateTime($this->unquoteSqlString(trim($fields[10])))
                            : null,
                    ];
                }
            }

            $inInsert = false;
            $statement = '';
        }

        fclose($handle);

        return $result;
    }

    /**
     * @param  LegacyReviewRow  $legacy
     * @return array<string, mixed>
     */
    public function toStagedPayload(array $legacy): array
    {
        return [
            'legacy_review_id' => (int) $legacy['legacy_review_id'],
            'legacy_customer_id' => (int) ($legacy['legacy_customer_id'] ?? 0),
            'author' => (string) $legacy['author'],
            'body' => (string) $legacy['body'],
            'stars' => (int) ($legacy['stars'] ?? 5),
            'legacy_status' => (int) ($legacy['legacy_status'] ?? 0),
            'created_at' => $legacy['created_at'] ?? null,
            'updated_at' => $legacy['updated_at'] ?? null,
            'reply_text' => $legacy['reply_text'] ?? null,
            'replied_at' => $legacy['replied_at'] ?? null,
        ];
    }

    private function lineEndsSqlStatement(string $line, bool &$inQuote, bool &$escaped): bool
    {
        $len = strlen($line);
        for ($i = 0; $i < $len; $i++) {
            $ch = $line[$i];
            if ($inQuote) {
                if ($escaped) {
                    $escaped = false;
                    continue;
                }
                if ($ch === '\\') {
                    $escaped = true;
                    continue;
                }
                if ($ch === "'") {
                    $inQuote = false;
                }
                continue;
            }
            if ($ch === "'") {
                $inQuote = true;
                continue;
            }
            if ($ch === ';') {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private function splitSqlTuples(string $valuesSql): array
    {
        $result = [];
        $buffer = '';
        $depth = 0;
        $inQuote = false;
        $escaped = false;

        $len = strlen($valuesSql);
        for ($i = 0; $i < $len; $i++) {
            $ch = $valuesSql[$i];

            if ($inQuote) {
                $buffer .= $ch;
                if ($escaped) {
                    $escaped = false;
                    continue;
                }
                if ($ch === '\\') {
                    $escaped = true;
                    continue;
                }
                if ($ch === "'") {
                    $inQuote = false;
                }
                continue;
            }

            if ($ch === "'") {
                $inQuote = true;
                $buffer .= $ch;
                continue;
            }

            if ($ch === '(') {
                $depth++;
                if ($depth === 1) {
                    $buffer = '';
                    continue;
                }
            }

            if ($ch === ')') {
                if ($depth === 1) {
                    $result[] = $buffer;
                    $buffer = '';
                    $depth = 0;
                    continue;
                }
                $depth = max(0, $depth - 1);
            }

            if ($depth >= 1) {
                $buffer .= $ch;
            }
        }

        return $result;
    }

    /**
     * @return list<string>
     */
    private function splitTupleFields(string $tuple): array
    {
        $fields = [];
        $buffer = '';
        $inQuote = false;
        $escaped = false;
        $len = strlen($tuple);

        for ($i = 0; $i < $len; $i++) {
            $ch = $tuple[$i];
            if ($inQuote) {
                $buffer .= $ch;
                if ($escaped) {
                    $escaped = false;
                    continue;
                }
                if ($ch === '\\') {
                    $escaped = true;
                    continue;
                }
                if ($ch === "'") {
                    $inQuote = false;
                }
                continue;
            }

            if ($ch === "'") {
                $inQuote = true;
                $buffer .= $ch;
                continue;
            }

            if ($ch === ',') {
                $fields[] = $buffer;
                $buffer = '';
                continue;
            }

            $buffer .= $ch;
        }
        $fields[] = $buffer;

        return $fields;
    }

    private function unquoteSqlString(string $value): ?string
    {
        if (strcasecmp($value, 'NULL') === 0) {
            return null;
        }
        if (! str_starts_with($value, "'") || ! str_ends_with($value, "'")) {
            return $value;
        }
        $inner = substr($value, 1, -1);
        $inner = str_replace("\\'", "'", $inner);
        $inner = str_replace('\\\\', '\\', $inner);

        return $inner;
    }

    private function decodeLegacyHtml(string $value): string
    {
        if ($value === '') {
            return '';
        }

        return html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    private function nullableDateTime(?string $value): ?string
    {
        $trim = trim((string) $value);
        if ($trim === '' || $trim === '0000-00-00 00:00:00') {
            return null;
        }

        return $trim;
    }

    /**
     * @return array{0:string,1:?string}
     */
    private function splitReviewAndReplyFromBody(string $body): array
    {
        if (trim($body) === '') {
            return ['', null];
        }

        $normalized = str_replace(["\\r\\n", "\\n", "\r\n", "\r"], "\n", $body);
        $parts = preg_split('/\n_{5,}\n/u', $normalized, 2);

        if (! is_array($parts) || count($parts) < 2) {
            return [trim($body), null];
        }

        $reviewText = trim($parts[0] ?? '');
        $replyText = trim($parts[1] ?? '');

        return [$reviewText, $replyText !== '' ? $replyText : null];
    }
}
