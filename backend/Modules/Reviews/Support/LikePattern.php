<?php

namespace Modules\Reviews\Support;

/**
 * Экранирует символы шаблона SQL LIKE (% _ \), чтобы пользователь не мог
 * «расширить» совпадение. Значение по-прежнему передаётся в запрос как bound
 * parameter Eloquent — отдельная защита от SQL-инъекций.
 */
final class LikePattern
{
    public static function wrapContains(string $value): string
    {
        $escaped = addcslashes($value, '\\%_');

        return '%'.$escaped.'%';
    }
}
