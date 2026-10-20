<?php

namespace Modules\ImportExport\Support\ElParfume;

class ElParfumeNginxMapBuilder
{
    /** @var array<string, int> */
    private const DECISION_PRIORITY = [
        'auto' => 0,
        'static' => 1,
        'review' => 2,
        'fallback' => 3,
    ];

    /**
     * @param  list<array<string, string>>  $rows
     * @return array{
     *     map_conf: string,
     *     server_conf: string,
     *     uri_entries: int,
     *     args_entries: int,
     *     duplicates_skipped: int,
     *     empty_targets: int,
     * }
     */
    public function build(array $rows, string $host, string $mapIncludePath): array
    {
        $host = rtrim(trim($host), '/');
        if ($host === '') {
            $host = 'https://perfumer.by';
        }

        $uriMap = [];
        $argsMap = [];
        $duplicatesSkipped = 0;
        $emptyTargets = 0;

        foreach ($rows as $row) {
            $oldPath = trim((string) ($row['old_path'] ?? ''));
            $target = trim((string) ($row['target'] ?? ''));
            $decision = trim((string) ($row['decision'] ?? 'fallback'));
            $urlForm = trim((string) ($row['url_form'] ?? ''));

            if ($target === '') {
                $emptyTargets++;

                continue;
            }

            if ($this->isIndexPhpRow($oldPath, $urlForm)) {
                $queryKey = $this->extractQueryKey($oldPath);
                if ($queryKey === '') {
                    continue;
                }
                $duplicatesSkipped += $this->putMapEntry($argsMap, $queryKey, $target, $decision);
            } else {
                foreach ($this->uriKeysForPath($oldPath) as $uriKey) {
                    $duplicatesSkipped += $this->putMapEntry($uriMap, $uriKey, $target, $decision);
                }
            }
        }

        ksort($uriMap, SORT_STRING);
        ksort($argsMap, SORT_STRING);

        $mapConf = $this->renderMapConf($uriMap, $argsMap);
        $serverConf = $this->renderServerConfInline($host, $mapIncludePath);

        return [
            'map_conf' => $mapConf,
            'server_conf' => $serverConf,
            'uri_entries' => count($uriMap),
            'args_entries' => count($argsMap),
            'duplicates_skipped' => $duplicatesSkipped,
            'empty_targets' => $emptyTargets,
        ];
    }

    /**
     * @param  array<string, array{target: string, decision: string}>  $map
     */
    private function putMapEntry(array &$map, string $key, string $target, string $decision): int
    {
        if ($key === '') {
            return 0;
        }

        if (! isset($map[$key])) {
            $map[$key] = ['target' => $target, 'decision' => $decision];

            return 0;
        }

        $existingPriority = self::DECISION_PRIORITY[$map[$key]['decision']] ?? 99;
        $newPriority = self::DECISION_PRIORITY[$decision] ?? 99;

        if ($newPriority < $existingPriority) {
            $map[$key] = ['target' => $target, 'decision' => $decision];

            return 0;
        }

        return 1;
    }

    private function isIndexPhpRow(string $oldPath, string $urlForm): bool
    {
        if ($urlForm === 'index_php') {
            return true;
        }

        return str_contains($oldPath, '?');
    }

    private function extractQueryKey(string $oldPath): string
    {
        $pos = strpos($oldPath, '?');
        if ($pos === false) {
            return '';
        }

        return substr($oldPath, $pos + 1);
    }

    /**
     * @return list<string>
     */
    private function uriKeysForPath(string $oldPath): array
    {
        $path = $oldPath;
        $qPos = strpos($path, '?');
        if ($qPos !== false) {
            $path = substr($path, 0, $qPos);
        }

        $path = rawurldecode($path);
        $path = $this->normalizeUriPath($path);

        if ($path === '/') {
            return ['/'];
        }

        $keys = [$path];
        if (str_ends_with($path, '/')) {
            $keys[] = rtrim($path, '/');
        } else {
            $keys[] = $path.'/';
        }

        return array_values(array_unique($keys));
    }

    private function normalizeUriPath(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return '/';
        }
        if ($path[0] !== '/') {
            $path = '/'.$path;
        }

        return $path;
    }

    /**
     * @param  array<string, array{target: string, decision: string}>  $uriMap
     * @param  array<string, array{target: string, decision: string}>  $argsMap
     */
    private function renderMapConf(array $uriMap, array $argsMap): string
    {
        $lines = [
            '# el-parfume.by redirect maps — include in http {} (not inside server {}).',
            '# If nginx warns about map hash, tune e.g.:',
            '#   map_hash_max_size 8192;',
            '#   map_hash_bucket_size 128;',
            '',
            'map $uri $elp_target_path {',
            '    hostnames off;',
            '    default "";',
        ];

        foreach ($uriMap as $key => $entry) {
            $lines[] = '    '.$this->nginxMapPair($key, $entry['target']);
        }

        $lines[] = '}';
        $lines[] = '';
        $lines[] = 'map $args $elp_target_args {';
        $lines[] = '    hostnames off;';
        $lines[] = '    default "";';

        foreach ($argsMap as $key => $entry) {
            $lines[] = '    '.$this->nginxMapPair($key, $entry['target']);
        }

        $lines[] = '}';
        $lines[] = '';

        return implode("\n", $lines);
    }

    private function nginxMapPair(string $key, string $value): string
    {
        return $this->nginxQuoted($key).' '.$this->nginxQuoted($value).';';
    }

    private function nginxQuoted(string $value): string
    {
        $escaped = str_replace(['\\', '"'], ['\\\\', '\\"'], $value);

        return '"'.$escaped.'"';
    }

    private function renderServerConf(string $host, string $mapIncludePath): string
    {
        $mapIncludePath = trim($mapIncludePath);
        if ($mapIncludePath === '') {
            $mapIncludePath = '/etc/nginx/el-parfume.by.map.conf';
        }

        return <<<NGINX
# el-parfume.by — 301 redirects to {$host} (one hop).
# Install map in http {}:
#   include {$mapIncludePath};
# Site:
#   sudo cp el-parfume.by.conf.example /etc/nginx/sites-available/el-parfume.by
#   sudo ln -s /etc/nginx/sites-available/el-parfume.by /etc/nginx/sites-enabled/
# TLS:
#   certbot --nginx -d el-parfume.by -d www.el-parfume.by
#
# Optional access log format (http {}) to inspect matched paths:
#   log_format elparfume_redirect '\$remote_addr \$request_uri -> path=\$elp_target_path args_map=\$elp_target_args';
#
# Incoming query strings (utm, page, sort) are dropped; targets carry their own query.

server {
    listen 80;
    listen [::]:80;
    server_name el-parfume.by www.el-parfume.by;

    access_log /var/log/nginx/el-parfume.access.log;

    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }

__REDIRECT_LOCATIONS__
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name el-parfume.by www.el-parfume.by;

    # ssl_certificate /etc/letsencrypt/live/el-parfume.by/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/el-parfume.by/privkey.pem;

    access_log /var/log/nginx/el-parfume.access.log;

    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }

__REDIRECT_LOCATIONS__
}

NGINX;
    }

    public function redirectLocationsBlock(string $host): string
    {
        $host = rtrim(trim($host), '/');

        return <<<NGINX
    location = /robots.txt {
        default_type text/plain;
        return 200 "User-agent: *\\nAllow: /\\n";
    }

    location = /sitemap.xml {
        return 301 {$host}/sitemap.xml;
    }

    location = /index.php {
        if (\$elp_target_args != "") {
            return 301 {$host}\$elp_target_args;
        }
        if (\$args = "") {
            return 301 {$host}/;
        }
        return 301 {$host}/catalog;
    }

    location / {
        if (\$elp_target_path != "") {
            return 301 {$host}\$elp_target_path;
        }
        return 301 {$host}/catalog;
    }
NGINX;
    }

    public function renderServerConfInline(string $host, string $mapIncludePath): string
    {
        $locations = $this->redirectLocationsBlock($host);

        return str_replace('__REDIRECT_LOCATIONS__', $locations, $this->renderServerConf($host, $mapIncludePath));
    }
}
