<?php

namespace Modules\ImportExport\Support\ElParfume;

final class ElParfumeRedirectMap
{
    /** @var array<string, string> */
    private array $targetByOldPath = [];

    /** @var array<string, array<string, string>> */
    private array $productRowByOldId = [];

    /**
     * @return list<array<string, string>>
     */
    public static function readCsvRows(string $path): array
    {
        if (! is_file($path)) {
            return [];
        }

        $handle = fopen($path, 'rb');
        if (! $handle) {
            return [];
        }

        $header = fgetcsv($handle);
        if (! is_array($header)) {
            fclose($handle);

            return [];
        }

        $rows = [];
        while (($line = fgetcsv($handle)) !== false) {
            if (! is_array($line) || $line === [null]) {
                continue;
            }
            $row = [];
            foreach ($header as $idx => $column) {
                $row[(string) $column] = (string) ($line[$idx] ?? '');
            }
            $rows[] = $row;
        }

        fclose($handle);

        return $rows;
    }

    /**
     * @param  list<array<string, string>>  $rows
     */
    public static function fromRows(array $rows): self
    {
        $map = new self();
        foreach ($rows as $row) {
            $oldPath = trim((string) ($row['old_path'] ?? ''));
            $target = trim((string) ($row['target'] ?? ''));
            if ($oldPath !== '' && $target !== '') {
                foreach ($map->pathLookupKeys($oldPath) as $key) {
                    if (! isset($map->targetByOldPath[$key])) {
                        $map->targetByOldPath[$key] = $target;
                    }
                }
            }

            if ((string) ($row['type'] ?? '') === 'product'
                && (string) ($row['url_form'] ?? '') === 'seo'
                && trim((string) ($row['old_id'] ?? '')) !== ''
            ) {
                $oldId = trim((string) $row['old_id']);
                if (! isset($map->productRowByOldId[$oldId])) {
                    $map->productRowByOldId[$oldId] = $row;
                }
            }
        }

        return $map;
    }

    public static function fromCsvPath(string $path): self
    {
        return self::fromRows(self::readCsvRows($path));
    }

    public function targetForOldPath(string $oldPath): ?string
    {
        $oldPath = trim($oldPath);
        if ($oldPath === '') {
            return null;
        }

        foreach ($this->pathLookupKeys($oldPath) as $key) {
            if (isset($this->targetByOldPath[$key])) {
                return $this->targetByOldPath[$key];
            }
        }

        return null;
    }

    /**
     * @return array<string, string>|null
     */
    public function productRowForOldId(string $oldId): ?array
    {
        $oldId = trim($oldId);
        if ($oldId === '') {
            return null;
        }

        return $this->productRowByOldId[$oldId] ?? null;
    }

    public function resolveBoundProductId(string $legacyProductId): ?int
    {
        $row = $this->productRowForOldId($legacyProductId);
        if ($row === null) {
            return null;
        }

        $ourId = trim((string) ($row['our_id'] ?? ''));
        if ($ourId === '' || ! ctype_digit($ourId)) {
            return null;
        }

        $method = (string) ($row['method'] ?? '');
        $decision = (string) ($row['decision'] ?? '');

        $allowed = false;
        if ($method === 'override') {
            $allowed = true;
        } elseif ($decision === 'auto' && in_array($method, [
            'exact_slug',
            'exact_name',
            'fuzzy_slug',
            'fuzzy_name',
            'both',
        ], true)) {
            $allowed = true;
        }

        if (! $allowed) {
            return null;
        }

        return (int) $ourId;
    }

    /**
     * @return list<string>
     */
    private function pathLookupKeys(string $oldPath): array
    {
        $path = rawurldecode(trim($oldPath));
        if ($path === '') {
            return [];
        }
        if (! str_starts_with($path, '/')) {
            $path = '/'.$path;
        }
        $qPos = strpos($path, '?');
        if ($qPos !== false) {
            $path = substr($path, 0, $qPos);
        }
        $hashPos = strpos($path, '#');
        if ($hashPos !== false) {
            $path = substr($path, 0, $hashPos);
        }
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }
        if ($path === '') {
            $path = '/';
        }

        if ($path === '/') {
            return ['/'];
        }

        return array_values(array_unique([$path, $path.'/']));
    }
}
