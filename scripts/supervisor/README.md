# Supervisor: perfumer-reverb

Общая настройка Reverb, env и проверка в браузере: [`README-dev.md` §6](../../README-dev.md#6-входящие-звонки-android--reverb--crm).

## BACKOFF / «Exited too quickly»

Процесс падает сразу после старта. По шагам на сервере:

### 1. Лог supervisor (главное)

```bash
sudo tail -80 /var/log/supervisor/perfumer-reverb.log
```

Там будет реальная ошибка PHP/artisan.

### 2. Запуск вручную от того же пользователя

```bash
cd /var/www/perfumer-by/backend
sudo -u www-data /usr/bin/php artisan reverb:start
```

Не закрывайте сразу — смотрите текст ошибки. `Ctrl+C` для выхода.

Если `php` не найден:

```bash
which php
# подставьте путь в /etc/supervisor/conf.d/perfumer-reverb.conf → command=
```

### 3. Порт 8080 уже занят

```bash
ss -tlnp | grep 8080
```

Если порт занят старым `reverb:start` (запущенным от root в SSH):

```bash
sudo kill <PID>
sudo supervisorctl restart perfumer-reverb
```

Два процесса на одном порту → мгновенный вылет и BACKOFF.

### 4. Пакет Reverb не установлен

```bash
cd /var/www/perfumer-by/backend
composer install
sudo -u www-data php artisan reverb:start
```

Ошибка вида `There are no commands defined in the "reverb" namespace` → нет `laravel/reverb`.

### 5. Права на `.env` и `storage`

```bash
cd /var/www/perfumer-by/backend
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R ug+rwx storage bootstrap/cache
# .env должен читаться www-data:
sudo chgrp www-data .env && sudo chmod 640 .env
```

### 6. Кеш config с чужими значениями

```bash
cd /var/www/perfumer-by/backend
php artisan config:clear
php artisan config:cache
sudo supervisorctl restart perfumer-reverb
```

### 7. `.env` — hostname без протокола

```env
REVERB_HOST=perfumer.test
REVERB_PORT=8080
REVERB_SCHEME=http
BROADCAST_CONNECTION=reverb
```

Не пишите `REVERB_HOST=http://perfumer.test`.

## Успешный статус

```bash
sudo supervisorctl status perfumer-reverb
# perfumer-reverb   RUNNING   pid ..., uptime 0:01:00

ss -tlnp | grep 8080
curl -i http://127.0.0.1:8080
# HTTP/1.1 404 Not Found — это нормально
```
