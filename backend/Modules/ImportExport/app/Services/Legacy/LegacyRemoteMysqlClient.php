<?php

namespace Modules\ImportExport\Services\Legacy;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use RuntimeException;
use stdClass;

/**
 * Read-only access to OpenCart MySQL: via SSH+mysql on the legacy host, or direct PDO.
 */
final class LegacyRemoteMysqlClient
{
    public function usesSsh(): bool
    {
        $host = trim((string) config('legacy.ssh.host', ''));
        $user = trim((string) config('legacy.ssh.user', ''));

        return $host !== '' && $user !== '';
    }

    public function ping(): void
    {
        $this->select('SELECT 1 AS ok');
    }

    /**
     * @return Collection<int, stdClass>
     */
    public function select(string $sql): Collection
    {
        if ($this->usesSsh()) {
            return $this->selectViaSsh($sql);
        }

        return collect(DB::connection('legacy')->select($sql));
    }

    /**
     * @param  list<int>  $ids
     * @return Collection<int, stdClass>
     */
    public function selectWhereIn(string $table, string $column, array $ids, string $extraWhere = ''): Collection
    {
        $ids = array_values(array_unique(array_filter(array_map(static fn ($id): int => (int) $id, $ids), static fn (int $id): bool => $id > 0)));
        if ($ids === []) {
            return collect();
        }

        $table = $this->assertIdentifier($table);
        $column = $this->assertIdentifier($column);
        $in = implode(',', $ids);
        $sql = "SELECT * FROM `{$table}` WHERE `{$column}` IN ({$in})";
        if ($extraWhere !== '') {
            $sql .= ' '.$extraWhere;
        }

        return $this->select($sql);
    }

    /**
     * @return Collection<int, stdClass>
     */
    private function selectViaSsh(string $sql): Collection
    {
        $sshHost = trim((string) config('legacy.ssh.host', ''));
        $sshUser = trim((string) config('legacy.ssh.user', ''));
        $sshPort = (int) config('legacy.ssh.port', 22);
        $privateKey = trim((string) config('legacy.ssh.private_key', ''));
        $knownHosts = trim((string) config('legacy.ssh.known_hosts', ''));

        $dbHost = (string) config('database.connections.legacy.host', '127.0.0.1');
        $dbPort = (int) config('database.connections.legacy.port', 3306);
        $database = (string) config('database.connections.legacy.database', '');
        $username = (string) config('database.connections.legacy.username', '');
        $password = (string) config('database.connections.legacy.password', '');

        if ($database === '' || $username === '') {
            throw new RuntimeException('Legacy MySQL не настроен (LEGACY_DB_DATABASE / LEGACY_DB_USERNAME).');
        }

        $privateKey = $this->resolvePrivateKey($privateKey);
        $knownHosts = $this->resolveKnownHostsFile($knownHosts);

        $remoteMysql = sprintf(
            'MYSQL_PWD=%s mysql --batch --raw --default-character-set=utf8mb4 -h %s -P %d -u %s %s -e %s',
            escapeshellarg($password),
            escapeshellarg($dbHost),
            $dbPort,
            escapeshellarg($username),
            escapeshellarg($database),
            escapeshellarg($sql),
        );

        $ssh = [
            'ssh',
            '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=accept-new',
            '-o', 'UserKnownHostsFile='.$knownHosts,
            '-o', 'GlobalKnownHostsFile=/dev/null',
            '-o', 'ConnectTimeout=15',
            '-p', (string) max(1, $sshPort),
        ];
        if ($privateKey !== null) {
            $ssh[] = '-o';
            $ssh[] = 'IdentitiesOnly=yes';
            $ssh[] = '-i';
            $ssh[] = $privateKey;
        }
        $ssh[] = $sshUser.'@'.$sshHost;
        $ssh[] = $remoteMysql;

        $result = Process::timeout(180)->run($ssh);
        if (! $result->successful()) {
            $err = trim($result->errorOutput() ?: $result->output());
            throw new RuntimeException(
                'Legacy SSH MySQL failed: '.($err !== '' ? $err : 'exit '.$result->exitCode())
            );
        }

        return $this->parseMysqlBatchOutput($result->output());
    }

    private function resolvePrivateKey(string $configured): ?string
    {
        if ($configured !== '' && is_readable($configured)) {
            return $configured;
        }

        $home = rtrim((string) (getenv('HOME') ?: ($_SERVER['HOME'] ?? '')), '/');
        if ($home !== '') {
            foreach (['id_ed25519', 'id_rsa'] as $name) {
                $candidate = $home.'/.ssh/'.$name;
                if (is_readable($candidate)) {
                    return $candidate;
                }
            }
        }

        // Без -i: ssh возьмёт ключи из агента / default identity текущего пользователя.
        return null;
    }

    private function resolveKnownHostsFile(string $configured): string
    {
        $candidates = [];
        if ($configured !== '') {
            $candidates[] = $configured;
        }
        $candidates[] = storage_path('app/legacy_ssh/known_hosts');

        $home = rtrim((string) (getenv('HOME') ?: ($_SERVER['HOME'] ?? '')), '/');
        if ($home !== '') {
            $candidates[] = $home.'/.ssh/known_hosts';
        }

        foreach ($candidates as $path) {
            $dir = dirname($path);
            if (! is_dir($dir)) {
                if (! @mkdir($dir, 0750, true) && ! is_dir($dir)) {
                    continue;
                }
            }
            if (! is_file($path)) {
                if (! @touch($path)) {
                    continue;
                }
                @chmod($path, 0640);
            }
            if (is_writable($path) || is_readable($path)) {
                return $path;
            }
        }

        throw new RuntimeException(
            'Не удалось подготовить known_hosts для Legacy SSH. '.
            'Проверь LEGACY_SSH_KNOWN_HOSTS или права на storage/app/legacy_ssh.'
        );
    }

    /**
     * @return Collection<int, stdClass>
     */
    private function parseMysqlBatchOutput(string $output): Collection
    {
        $output = str_replace("\r\n", "\n", $output);
        $lines = preg_split("/\n/", $output, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ($lines === []) {
            return collect();
        }

        $headers = str_getcsv(array_shift($lines), "\t");
        $rows = [];
        foreach ($lines as $line) {
            $fields = str_getcsv($line, "\t");
            $row = new stdClass;
            foreach ($headers as $i => $header) {
                $value = $fields[$i] ?? null;
                if ($value === '\\N' || $value === 'NULL') {
                    $value = null;
                } elseif (is_string($value)) {
                    $value = stripcslashes($value);
                }
                $row->{$header} = $value;
            }
            $rows[] = $row;
        }

        return collect($rows);
    }

    private function assertIdentifier(string $name): string
    {
        if (preg_match('/^[A-Za-z0-9_]+$/', $name) !== 1) {
            throw new RuntimeException('Invalid SQL identifier: '.$name);
        }

        return $name;
    }
}
