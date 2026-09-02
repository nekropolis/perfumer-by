<?php

namespace Modules\ImportExport\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Кэш резолва редиректов. Эндпоинт зовёт middleware витрины на каждый неизвестный
 * путь, поэтому это самый частый запрос к API; попадания и промахи кэшируем одинаково.
 *
 * Ключи по пути перечислить нельзя, поэтому инвалидация — сдвигом версии.
 */
final class SeoRedirectCache
{
    private const VERSION_KEY = 'seo-redirects:version';

    private const TTL_SECONDS = 300;

    /**
     * @return array{to_path: string|null, http_code: int}|null
     */
    public static function resolve(string $path): ?array
    {
        $key = sprintf(
            'seo-redirects:v%d:%s',
            (int) Cache::get(self::VERSION_KEY, 1),
            md5($path),
        );

        $cached = Cache::remember($key, self::TTL_SECONDS, static function () use ($path) {
            $row = DB::table('seo_redirects')
                ->where('from_path', $path)
                ->where('is_active', true)
                ->first(['to_path', 'http_code']);

            // false — «редиректа нет»: отрицательный результат тоже кэшируем,
            // иначе сканеры случайных URL продолжат бить в базу.
            return $row === null ? false : [
                'to_path' => $row->to_path,
                'http_code' => (int) $row->http_code,
            ];
        });

        return $cached === false ? null : $cached;
    }

    public static function flush(): void
    {
        if (! Cache::has(self::VERSION_KEY)) {
            Cache::forever(self::VERSION_KEY, 1);
        }

        Cache::increment(self::VERSION_KEY);
    }
}
