<?php

namespace Modules\ImportExport\Support\ElParfume;

final class ElParfumeDumpReader
{
    /** @var array<string, list<array<string, ?string>>> */
    private array $cache = [];

    /** @var array<string, list<string>> */
    private array $columnsCache = [];

    public function __construct(private readonly string $dumpPath) {}

    /**
     * @return list<array<string, ?string>>
     */
    public function rows(string $table): array
    {
        if (isset($this->cache[$table])) {
            return $this->cache[$table];
        }

        if (! is_file($this->dumpPath)) {
            $this->cache[$table] = [];

            return [];
        }

        $columns = $this->columnsForTable($table);
        if ($columns === []) {
            $this->cache[$table] = [];

            return [];
        }

        $this->cache[$table] = $this->loadInsertRows($table, $columns);

        return $this->cache[$table];
    }

    /**
     * @return list<string>
     */
    private function columnsForTable(string $table): array
    {
        if (isset($this->columnsCache[$table])) {
            return $this->columnsCache[$table];
        }

        $handle = fopen($this->dumpPath, 'rb');
        if (! $handle) {
            $this->columnsCache[$table] = [];

            return [];
        }

        $columns = [];
        $inCreate = false;
        $prefix = 'CREATE TABLE `'.$table.'`';

        while (($line = fgets($handle)) !== false) {
            if (! $inCreate) {
                if (str_starts_with($line, $prefix)) {
                    $inCreate = true;
                }
                continue;
            }

            if (preg_match('/^\s+`([^`]+)`/u', $line, $matches) === 1) {
                $columns[] = $matches[1];
            }

            if (str_contains($line, ') ENGINE') || preg_match('/^\)\s*;/', trim($line)) === 1) {
                break;
            }
        }

        fclose($handle);
        $this->columnsCache[$table] = $columns;

        return $columns;
    }

    /**
     * @param  list<string>  $defaultColumns
     * @return list<array<string, ?string>>
     */
    private function loadInsertRows(string $table, array $defaultColumns): array
    {
        $handle = fopen($this->dumpPath, 'rb');
        if (! $handle) {
            return [];
        }

        $prefix = 'INSERT INTO `'.$table.'`';
        $result = [];

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

            foreach ($this->parseInsertStatement($statement, $defaultColumns) as $row) {
                $result[] = $row;
            }
        }

        fclose($handle);

        return $result;
    }

    /**
     * @param  list<string>  $defaultColumns
     * @return list<array<string, ?string>>
     */
    private function parseInsertStatement(string $insertSql, array $defaultColumns): array
    {
        $columns = $defaultColumns;
        if (preg_match('/^INSERT INTO `[^`]+`\s*\(([^)]+)\)\s*VALUES/is', $insertSql, $colsMatch) === 1) {
            $columns = array_map(
                static fn (string $col): string => trim(str_replace('`', '', $col)),
                array_filter(array_map('trim', explode(',', (string) $colsMatch[1])))
            );
        }

        $valuesPos = stripos($insertSql, 'VALUES');
        if ($valuesPos === false || $columns === []) {
            return [];
        }

        $tuples = $this->splitSqlTuples(substr($insertSql, $valuesPos + 6));
        $rows = [];

        foreach ($tuples as $tuple) {
            $fields = $this->splitTupleFields($tuple);
            if (count($fields) !== count($columns)) {
                continue;
            }

            $row = [];
            foreach ($columns as $idx => $column) {
                $row[$column] = $this->normalizeSqlValue(trim($fields[$idx] ?? ''));
            }
            $rows[] = $row;
        }

        return $rows;
    }

    private function normalizeSqlValue(string $value): ?string
    {
        if (strcasecmp($value, 'NULL') === 0) {
            return null;
        }

        if (str_starts_with($value, "'") && str_ends_with($value, "'")) {
            return $this->unquoteSqlString($value);
        }

        return $value === '' ? null : $value;
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
        if (! str_starts_with($value, "'") || ! str_ends_with($value, "'")) {
            return $value;
        }
        $inner = substr($value, 1, -1);
        $inner = str_replace("\\'", "'", $inner);
        $inner = str_replace('\\\\', '\\', $inner);

        return $inner;
    }
}
