<?php

namespace Modules\Catalog\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;

class ValidUploadedSpreadsheet implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!$value instanceof UploadedFile) {
            $fail('Файл не получен. Проверьте, что запрос отправляет multipart/form-data с полем file.');

            return;
        }

        if (!$value->isValid()) {
            $message = match ($value->getError()) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => sprintf(
                    'Файл слишком большой. Лимит PHP: upload_max_filesize=%s, post_max_size=%s. Увеличьте лимиты в php.ini и client_max_body_size в nginx (см. PRODUCTION.md).',
                    ini_get('upload_max_filesize') ?: '?',
                    ini_get('post_max_size') ?: '?',
                ),
                UPLOAD_ERR_PARTIAL => 'Файл загружен не полностью — повторите загрузку.',
                UPLOAD_ERR_NO_FILE => 'Файл не был передан на сервер.',
                UPLOAD_ERR_NO_TMP_DIR => 'На сервере не настроена временная папка для загрузки файлов.',
                UPLOAD_ERR_CANT_WRITE => 'Сервер не смог сохранить загруженный файл на диск.',
                UPLOAD_ERR_EXTENSION => 'Загрузка файла заблокирована расширением PHP.',
                default => 'Ошибка загрузки файла (код '.$value->getError().').',
            };
            $fail($message);

            return;
        }
    }
}
