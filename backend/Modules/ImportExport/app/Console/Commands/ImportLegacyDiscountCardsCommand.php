<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Modules\Loyalty\Models\DiscountCard;

class ImportLegacyDiscountCardsCommand extends Command
{
    /** Promo / non-card coupon codes from the legacy dump. */
    private const SKIP_CODES = [
        'zakaz10',
        'VIPCLUB',
        'MBPerfum5',
    ];

    protected $signature = 'legacy:import-discount-cards
        {--dump=storage/app/public/perfumer_db.sql : Path to legacy SQL dump}
        {--dry-run : Do not write into DB}';

    protected $description = 'Import legacy discount cards from oc_coupon into discount_cards (no client attach)';

    public function handle(): int
    {
        $dumpPath = (string) $this->option('dump');
        $dryRun = (bool) $this->option('dry-run');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");

            return self::FAILURE;
        }

        $legacyRows = $this->extractRowsFromInsertTable($dumpPath, 'oc_coupon');
        if ($legacyRows === []) {
            $this->warn('No oc_coupon rows found in dump.');

            return self::SUCCESS;
        }

        /** @var array<string, array{card_number: string, discount_percent: float, issued_at: ?string, notes: ?string}> $byNumber */
        $byNumber = [];
        $skippedPromo = 0;
        $skippedInvalid = 0;
        $skippedFixed = 0;

        foreach ($legacyRows as $row) {
            $type = strtoupper(trim((string) ($row['type'] ?? '')));
            if ($type !== 'P') {
                $skippedFixed++;
                continue;
            }

            $cardNumber = $this->normalizeCardNumber((string) ($row['code'] ?? ''));
            if ($cardNumber === '') {
                $skippedInvalid++;
                continue;
            }

            if (in_array($cardNumber, self::SKIP_CODES, true)) {
                $skippedPromo++;
                continue;
            }

            $percent = DiscountCard::effectiveDiscountPercent((float) ($row['discount'] ?? 0));
            $name = trim((string) ($row['name'] ?? ''));
            $notes = ($name !== '' && $name !== $cardNumber) ? $name : null;
            $issuedAt = $this->normalizeDateTime((string) ($row['date_added'] ?? ''));

            if (isset($byNumber[$cardNumber])) {
                $existing = $byNumber[$cardNumber];
                $keepNew = $percent > $existing['discount_percent']
                    || ($percent === $existing['discount_percent']
                        && ($issuedAt ?? '') > ($existing['issued_at'] ?? ''));
                if (! $keepNew) {
                    continue;
                }
            }

            $byNumber[$cardNumber] = [
                'card_number' => $cardNumber,
                'discount_percent' => $percent,
                'issued_at' => $issuedAt,
                'notes' => $notes,
            ];
        }

        $processed = count($byNumber);
        $created = 0;
        $updated = 0;
        $unchanged = 0;

        if ($dryRun) {
            $created = $processed;
            $this->table(
                ['metric', 'count'],
                [
                    ['dump_rows', count($legacyRows)],
                    ['unique_cards', $processed],
                    ['would_create_or_update', $created],
                    ['skipped_promo', $skippedPromo],
                    ['skipped_non_percent', $skippedFixed],
                    ['skipped_invalid', $skippedInvalid],
                    ['dry_run', 'yes'],
                ]
            );

            return self::SUCCESS;
        }

        $existingByNumber = collect();
        foreach (array_chunk(array_keys($byNumber), 500) as $chunk) {
            $existingByNumber = $existingByNumber->merge(
                DiscountCard::query()
                    ->whereIn('card_number', $chunk)
                    ->get(['id', 'card_number', 'discount_percent', 'issued_at', 'notes'])
            );
        }
        $existingByNumber = $existingByNumber->keyBy('card_number');

        foreach ($byNumber as $cardNumber => $payload) {
            $existing = $existingByNumber->get($cardNumber);
            if ($existing === null) {
                DiscountCard::query()->create([
                    'card_number' => $payload['card_number'],
                    'discount_percent' => $payload['discount_percent'],
                    'status' => DiscountCard::STATUS_ACTIVE,
                    'issued_at' => $payload['issued_at'],
                    'notes' => $payload['notes'],
                ]);
                $created++;
                continue;
            }

            $existingPercent = number_format((float) $existing->discount_percent, 2, '.', '');
            $payloadPercent = number_format($payload['discount_percent'], 2, '.', '');
            $needsUpdate = $existingPercent !== $payloadPercent
                || (string) ($existing->issued_at?->format('Y-m-d H:i:s') ?? '') !== (string) ($payload['issued_at'] ?? '')
                || (string) ($existing->notes ?? '') !== (string) ($payload['notes'] ?? '');

            if (! $needsUpdate) {
                $unchanged++;
                continue;
            }

            $existing->update([
                'discount_percent' => $payload['discount_percent'],
                'issued_at' => $payload['issued_at'],
                'notes' => $payload['notes'],
            ]);
            $updated++;
        }

        $this->table(
            ['metric', 'count'],
            [
                ['dump_rows', count($legacyRows)],
                ['unique_cards', $processed],
                ['created', $created],
                ['updated', $updated],
                ['unchanged', $unchanged],
                ['skipped_promo', $skippedPromo],
                ['skipped_non_percent', $skippedFixed],
                ['skipped_invalid', $skippedInvalid],
                ['dry_run', 'no'],
            ]
        );

        return self::SUCCESS;
    }

    private function normalizeCardNumber(string $code): string
    {
        $code = trim($code);
        $code = ltrim($code, '`');
        $code = trim($code);

        return $code;
    }

    private function normalizeDateTime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '' || $value === '0000-00-00 00:00:00') {
            return null;
        }

        return $value;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function extractRowsFromInsertTable(string $dumpPath, string $tableName): array
    {
        $handle = fopen($dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $result = [];
        $prefix = 'INSERT INTO `'.$tableName.'`';

        while (($line = fgets($handle)) !== false) {
            if (! str_starts_with($line, $prefix)) {
                continue;
            }

            $statement = $line;
            $inQuote = false;
            $escaped = false;
            while (! $this->lineEndsSqlStatement($line, $inQuote, $escaped) && ($line = fgets($handle)) !== false) {
                $statement .= $line;
            }

            foreach ($this->parseInsertStatementRows($statement) as $row) {
                $result[] = $row;
            }
        }

        fclose($handle);

        return $result;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function parseInsertStatementRows(string $insertSql): array
    {
        if (preg_match('/^INSERT INTO `[^`]+`\s*\((.+)\)\s*VALUES\s*/is', $insertSql, $colsMatch) !== 1) {
            return [];
        }

        $columns = array_map(
            static fn (string $col): string => trim(str_replace('`', '', $col)),
            array_filter(array_map('trim', explode(',', (string) $colsMatch[1])))
        );
        $valuesPos = stripos($insertSql, 'VALUES');
        if ($valuesPos === false || $columns === []) {
            return [];
        }

        $tuples = $this->splitSqlTuples(substr($insertSql, $valuesPos + 6));
        $result = [];
        foreach ($tuples as $tuple) {
            $fields = $this->splitTupleFields($tuple);
            if (count($fields) !== count($columns)) {
                continue;
            }

            $row = [];
            foreach ($columns as $idx => $column) {
                $row[$column] = $this->unquoteSqlValue(trim($fields[$idx] ?? ''));
            }
            $result[] = $row;
        }

        return $result;
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

    private function unquoteSqlValue(string $value): mixed
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
}
