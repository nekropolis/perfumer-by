<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Modules\Users\Models\User;

class ImportLegacyCustomersCommand extends Command
{
    protected $signature = 'legacy:import-customers
        {--dump=storage/app/public/perfumer_db.sql : Path to legacy SQL dump}
        {--dry-run : Do not write into DB}
        {--truncate-map : Truncate legacy_map_customers before import}';

    protected $description = 'Import legacy customers from oc_customer into users and map legacy ids';

    public function handle(): int
    {
        $dumpPath = (string) $this->option('dump');
        $dryRun = (bool) $this->option('dry-run');
        $truncateMap = (bool) $this->option('truncate-map');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");
            return self::FAILURE;
        }

        $legacyRows = $this->extractRowsFromInsertTable($dumpPath, 'oc_customer');
        if ($legacyRows === []) {
            $this->warn('No oc_customer rows found in dump.');
            return self::SUCCESS;
        }

        if (! $dryRun && $truncateMap) {
            DB::table('legacy_map_customers')->truncate();
        }

        $users = User::query()
            ->get(['id', 'email', 'phone'])
            ->all();
        $usersByEmail = [];
        $usersByPhone = [];
        foreach ($users as $user) {
            $email = $this->normalizeEmail((string) ($user->email ?? ''));
            if ($email !== '') {
                $usersByEmail[$email] = (int) $user->id;
            }
            $phone = $this->normalizePhone((string) ($user->phone ?? ''));
            if ($phone !== '') {
                $usersByPhone[$phone] = (int) $user->id;
            }
        }

        $processed = 0;
        $created = 0;
        $matched = 0;
        $failed = 0;
        $wouldCreate = 0;

        foreach ($legacyRows as $row) {
            $processed++;
            $legacyCustomerId = (int) ($row['customer_id'] ?? 0);
            if ($legacyCustomerId <= 0) {
                continue;
            }

            $firstName = trim((string) ($row['firstname'] ?? ''));
            $lastName = trim((string) ($row['lastname'] ?? ''));
            $name = trim($firstName.' '.$lastName);
            if ($name === '') {
                $name = 'Покупатель #'.$legacyCustomerId;
            }

            $email = $this->normalizeEmail((string) ($row['email'] ?? ''));
            $phone = $this->normalizePhone((string) ($row['telephone'] ?? ''));

            $matchMethod = null;
            $matchedUserId = null;
            if ($email !== '' && isset($usersByEmail[$email])) {
                $matchedUserId = (int) $usersByEmail[$email];
                $matchMethod = 'email_exact';
            } elseif ($phone !== '' && isset($usersByPhone[$phone])) {
                $matchedUserId = (int) $usersByPhone[$phone];
                $matchMethod = 'phone_exact';
            }

            if ($matchedUserId !== null) {
                if (! $dryRun) {
                    DB::table('legacy_map_customers')->upsert(
                        [[
                            'legacy_customer_id' => $legacyCustomerId,
                            'user_id' => $matchedUserId,
                            'status' => 'matched',
                            'match_method' => $matchMethod,
                            'note' => null,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]],
                        ['legacy_customer_id'],
                        ['user_id', 'status', 'match_method', 'note', 'updated_at']
                    );
                }
                $matched++;
                continue;
            }

            if ($dryRun) {
                $wouldCreate++;
                continue;
            }

            try {
                $finalEmail = $this->resolveUniqueEmail($email !== '' ? $email : "legacy-customer-{$legacyCustomerId}@legacy.local");
                $finalPhone = $this->resolveUniquePhone($phone);

                $userId = (int) User::query()->insertGetId([
                    'name' => $name,
                    'email' => $finalEmail,
                    'password' => Hash::make(Str::random(40)),
                    'phone' => $finalPhone !== '' ? $finalPhone : null,
                    'phone_verified_at' => null,
                    'role' => 'customer',
                    'created_at' => $this->normalizeDateTime((string) ($row['date_added'] ?? '')) ?? now(),
                    'updated_at' => now(),
                ]);

                if ($finalEmail !== '') {
                    $usersByEmail[$finalEmail] = $userId;
                }
                if ($finalPhone !== '') {
                    $usersByPhone[$finalPhone] = $userId;
                }

                DB::table('legacy_map_customers')->upsert(
                    [[
                        'legacy_customer_id' => $legacyCustomerId,
                        'user_id' => $userId,
                        'status' => 'created',
                        'match_method' => 'created_new',
                        'note' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]],
                    ['legacy_customer_id'],
                    ['user_id', 'status', 'match_method', 'note', 'updated_at']
                );

                $created++;
            } catch (\Throwable $e) {
                DB::table('legacy_map_customers')->upsert(
                    [[
                        'legacy_customer_id' => $legacyCustomerId,
                        'user_id' => null,
                        'status' => 'failed',
                        'match_method' => null,
                        'note' => mb_substr($e->getMessage(), 0, 1800),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]],
                    ['legacy_customer_id'],
                    ['user_id', 'status', 'match_method', 'note', 'updated_at']
                );
                $failed++;
            }
        }

        $this->info('Legacy customers import finished.');
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));
        $this->line("Processed: {$processed}");
        $this->line("Matched existing users: {$matched}");
        $this->line("Created users: {$created}");
        $this->line("Would create (dry-run): {$wouldCreate}");
        $this->line("Failed: {$failed}");

        return self::SUCCESS;
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

            $rows = $this->parseInsertStatementRows($statement);
            foreach ($rows as $row) {
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

    private function normalizeEmail(string $email): string
    {
        $email = mb_strtolower(trim($email), 'UTF-8');
        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return '';
        }
        return $email;
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '80') && strlen($digits) === 11) {
            $digits = '375'.substr($digits, 2);
        }
        if (str_starts_with($digits, '375') && strlen($digits) === 12) {
            return '+'.$digits;
        }
        if (strlen($digits) >= 9) {
            return '+'.$digits;
        }
        return '';
    }

    private function resolveUniqueEmail(string $baseEmail): string
    {
        $baseEmail = $this->normalizeEmail($baseEmail);
        if ($baseEmail === '') {
            $baseEmail = 'legacy-user@legacy.local';
        }

        if (! User::query()->where('email', $baseEmail)->exists()) {
            return $baseEmail;
        }

        [$local, $domain] = array_pad(explode('@', $baseEmail, 2), 2, 'legacy.local');
        $counter = 2;
        while (true) {
            $candidate = $local.'+'.$counter.'@'.$domain;
            if (! User::query()->where('email', $candidate)->exists()) {
                return $candidate;
            }
            $counter++;
        }
    }

    private function resolveUniquePhone(string $phone): string
    {
        $phone = $this->normalizePhone($phone);
        if ($phone === '') {
            return '';
        }
        if (! User::query()->where('phone', $phone)->exists()) {
            return $phone;
        }
        return '';
    }

    private function normalizeDateTime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '' || $value === '0000-00-00 00:00:00') {
            return null;
        }
        return $value;
    }
}

