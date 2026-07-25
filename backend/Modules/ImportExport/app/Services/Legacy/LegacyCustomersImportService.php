<?php

namespace Modules\ImportExport\Services\Legacy;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Support\Phone;
use Modules\Users\Models\Client;
use Throwable;

final class LegacyCustomersImportService
{
    public function __construct(
        private readonly LegacyRemoteMysqlClient $legacyMysql,
    ) {}

    /**
     * @return array{
     *     after_customer_id: int,
     *     fetched: int,
     *     skipped: int,
     *     matched: int,
     *     created: int,
     *     failed: int
     * }
     */
    public function importIncremental(): array
    {
        $afterId = (int) (DB::table('legacy_map_customers')->max('legacy_customer_id') ?? 0);

        $rows = $this->legacyMysql->select(
            'SELECT * FROM `oc_customer` WHERE `customer_id` > '.(int) $afterId.' ORDER BY `customer_id`'
        );

        $clients = Client::query()->get(['id', 'email', 'phone']);
        $clientsByEmail = [];
        $clientsByPhone = [];
        foreach ($clients as $client) {
            $email = $this->normalizeEmail((string) ($client->email ?? ''));
            if ($email !== '') {
                $clientsByEmail[$email] = (int) $client->id;
            }
            $phone = $this->normalizePhone((string) ($client->phone ?? ''));
            if ($phone !== '') {
                $clientsByPhone[$phone] = (int) $client->id;
            }
        }

        $skipped = 0;
        $matched = 0;
        $created = 0;
        $failed = 0;

        foreach ($rows as $row) {
            $legacyCustomerId = (int) ($row->customer_id ?? 0);
            if ($legacyCustomerId <= 0) {
                continue;
            }

            if (DB::table('legacy_map_customers')->where('legacy_customer_id', $legacyCustomerId)->exists()) {
                $skipped++;
                continue;
            }

            $firstName = trim((string) ($row->firstname ?? ''));
            $lastName = trim((string) ($row->lastname ?? ''));
            $name = trim($firstName.' '.$lastName);
            if ($name === '') {
                $name = 'Покупатель #'.$legacyCustomerId;
            }

            $email = $this->normalizeEmail((string) ($row->email ?? ''));
            $phone = $this->normalizePhone((string) ($row->telephone ?? ''));

            $matchMethod = null;
            $matchedClientId = null;
            if ($email !== '' && isset($clientsByEmail[$email])) {
                $matchedClientId = $clientsByEmail[$email];
                $matchMethod = 'email_exact';
            } elseif ($phone !== '' && isset($clientsByPhone[$phone])) {
                $matchedClientId = $clientsByPhone[$phone];
                $matchMethod = 'phone_exact';
            }

            if ($matchedClientId !== null) {
                DB::table('legacy_map_customers')->upsert(
                    [[
                        'legacy_customer_id' => $legacyCustomerId,
                        'client_id' => $matchedClientId,
                        'status' => 'matched',
                        'match_method' => $matchMethod,
                        'note' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]],
                    ['legacy_customer_id'],
                    ['client_id', 'status', 'match_method', 'note', 'updated_at']
                );
                $matched++;
                continue;
            }

            try {
                $finalEmail = $this->resolveUniqueEmail(
                    $email !== '' ? $email : "legacy-customer-{$legacyCustomerId}@legacy.local"
                );
                $finalPhone = $this->resolveUniquePhone($phone);

                $clientId = (int) Client::query()->insertGetId([
                    'name' => $name,
                    'first_name' => $firstName !== '' ? $firstName : null,
                    'last_name' => $lastName !== '' ? $lastName : null,
                    'email' => $finalEmail,
                    'password' => Hash::make(Str::random(40)),
                    'phone' => $finalPhone !== '' ? $finalPhone : null,
                    'phone_verified_at' => null,
                    'created_at' => $this->normalizeDateTime((string) ($row->date_added ?? '')) ?? now(),
                    'updated_at' => now(),
                ]);

                if ($finalEmail !== '') {
                    $clientsByEmail[$finalEmail] = $clientId;
                }
                if ($finalPhone !== '') {
                    $clientsByPhone[$finalPhone] = $clientId;
                }

                DB::table('legacy_map_customers')->upsert(
                    [[
                        'legacy_customer_id' => $legacyCustomerId,
                        'client_id' => $clientId,
                        'status' => 'created',
                        'match_method' => 'created_new',
                        'note' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]],
                    ['legacy_customer_id'],
                    ['client_id', 'status', 'match_method', 'note', 'updated_at']
                );
                $created++;
            } catch (Throwable $e) {
                DB::table('legacy_map_customers')->upsert(
                    [[
                        'legacy_customer_id' => $legacyCustomerId,
                        'client_id' => null,
                        'status' => 'failed',
                        'match_method' => null,
                        'note' => mb_substr($e->getMessage(), 0, 1800),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]],
                    ['legacy_customer_id'],
                    ['client_id', 'status', 'match_method', 'note', 'updated_at']
                );
                $failed++;
            }
        }

        return [
            'after_customer_id' => $afterId,
            'fetched' => $rows->count(),
            'skipped' => $skipped,
            'matched' => $matched,
            'created' => $created,
            'failed' => $failed,
        ];
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
        return Phone::normalizeBelarusDigits($phone);
    }

    private function resolveUniqueEmail(string $baseEmail): string
    {
        $baseEmail = $this->normalizeEmail($baseEmail);
        if ($baseEmail === '') {
            $baseEmail = 'legacy-user@legacy.local';
        }

        if (! Client::query()->where('email', $baseEmail)->exists()) {
            return $baseEmail;
        }

        [$local, $domain] = array_pad(explode('@', $baseEmail, 2), 2, 'legacy.local');
        $counter = 2;
        while (true) {
            $candidate = $local.'+'.$counter.'@'.$domain;
            if (! Client::query()->where('email', $candidate)->exists()) {
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
        if (! Client::query()->where('phone', $phone)->exists()) {
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
