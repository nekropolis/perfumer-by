#!/usr/bin/env bash
#
# Dev-deploy — запускается НА dev-сервере (192.168.0.25).
#
# Контекст:
#   Файлы на сервер льются VSCode SFTP-расширением (см. .vscode/sftp.json).
#   Этот скрипт запускается уже НА сервере (через SSH или просто из /var/www/...)
#   и делает то, что SFTP сделать не может: composer, artisan, npm, перезапуск
#   сервисов.
#
#   Пример запуска:
#     ssh root@192.168.0.25
#     cd /var/www/perfumer-by
#     ./scripts/deploy-dev.sh
#
# Отличия от scripts/deploy.sh (prod):
#   • composer install БЕЗ --no-dev (на dev нужны faker/pint/phpunit);
#   • cache:clear, а не config:cache/route:cache — на dev удобнее видеть правки
#     сразу, без пересборки кешей;
#   • нет maintenance-mode (dev не смотрит на пользователей);
#   • нет git pull (файлы уже на сервере через SFTP).
#
# Использование:
#   ./scripts/deploy-dev.sh                 # полный прогон
#   ./scripts/deploy-dev.sh --seed          # + прогон сидеров
#   ./scripts/deploy-dev.sh --no-build      # пропустить npm run build
#   ./scripts/deploy-dev.sh --only-backend  # только backend
#   ./scripts/deploy-dev.sh --only-frontend # только frontend
#   ./scripts/deploy-dev.sh --logs          # после деплоя tail -F логов (Ctrl+C)
#   ./scripts/deploy-dev.sh --npm-ci        # frontend: полный npm ci (тяжело по RAM;
#                                             по умолчанию — npm install по lockfile)
#   FRONTEND_NPM_SUBCMD=ci ./scripts/deploy-dev.sh  # то же, что --npm-ci
#   ./scripts/deploy-dev.sh --help
#
# Переопределение путей (если ставишь проект не в /var/www/perfumer-by):
#   PROJECT_ROOT=/opt/perfumer ./scripts/deploy-dev.sh

set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Config.
# ---------------------------------------------------------------------------
ROOT="${PROJECT_ROOT:-/var/www/perfumer-by}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-composer}"
NPM_BIN="${NPM_BIN:-npm}"
PM2_BIN="${PM2_BIN:-pm2}"

# На dev-сервере запуск обычно идёт из-под root. Composer отключает плагины
# для root без этого флага — merge-plugin тогда не подмешивает Modules/*/composer.json
# (Class Modules\... not found). Флаг + дублирующий PSR-4 в backend/composer.json лечат.
export COMPOSER_ALLOW_SUPERUSER=1

FRONT_APP_NAME="${FRONT_APP_NAME:-perfumer-frontend}"
QUEUE_GROUP="${QUEUE_GROUP:-perfumer-queue:*}"
COMPOSER_MEMORY_LIMIT="${COMPOSER_MEMORY_LIMIT:-512M}"

# ---------------------------------------------------------------------------
# Flags.
# ---------------------------------------------------------------------------
DO_COMPOSER=1
DO_MIGRATE=1
DO_SEED=0
DO_CACHE_CLEAR=1
DO_QUEUE_RESTART=1
DO_FRONTEND_DEPS=1
DO_FRONTEND_BUILD=1
DO_FRONTEND_RELOAD=1
TAIL_LOGS=0
# frontend: «install» не сносит node_modules целиком — меньше пик памяти на слабом dev;
# «ci» — чистая переустановка (как prod), нужна если node_modules повреждён/рассинхрон).
FRONTEND_NPM_SUBCMD="${FRONTEND_NPM_SUBCMD:-install}"

print_help() {
    sed -n '1,/^set -Eeuo/ p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-composer)        DO_COMPOSER=0 ;;
        --no-migrate)         DO_MIGRATE=0 ;;
        --seed)               DO_SEED=1 ;;
        --no-cache-clear)     DO_CACHE_CLEAR=0 ;;
        --no-queue-restart)   DO_QUEUE_RESTART=0 ;;
        --no-frontend)        DO_FRONTEND_DEPS=0; DO_FRONTEND_BUILD=0; DO_FRONTEND_RELOAD=0 ;;
        --no-build)           DO_FRONTEND_BUILD=0 ;;
        --only-backend)       DO_FRONTEND_DEPS=0; DO_FRONTEND_BUILD=0; DO_FRONTEND_RELOAD=0 ;;
        --only-frontend)
            DO_COMPOSER=0
            DO_MIGRATE=0
            DO_CACHE_CLEAR=0
            DO_QUEUE_RESTART=0
            ;;
        --logs)               TAIL_LOGS=1 ;;
        --npm-ci)             FRONTEND_NPM_SUBCMD=ci ;;
        -h|--help)            print_help ;;
        *)
            printf 'Unknown flag: %s\n' "$1" >&2
            printf 'Use --help for usage.\n' >&2
            exit 2
            ;;
    esac
    shift
done

# ---------------------------------------------------------------------------
# Utils.
# ---------------------------------------------------------------------------
log()   { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }
fail()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

require_dir() {
    [[ -d "$1" ]] || fail "Нет директории: $1"
}

require_bin() {
    command -v "$1" >/dev/null 2>&1 || warn "Команда '$1' не найдена в PATH (PATH=$PATH)"
}

# ERR-trap срабатывает на каждом уровне вложенной команды/subshell'а. Чтобы
# сообщение об ошибке не печаталось дважды, ставим флажок «уже отработали».
ERR_PRINTED=0
on_error() {
    local code=$?
    if [[ $ERR_PRINTED -eq 0 ]]; then
        warn "Deploy прерван (exit $code)"
        ERR_PRINTED=1
    fi
    exit "$code"
}
trap on_error ERR

# ---------------------------------------------------------------------------
# Preflight.
# ---------------------------------------------------------------------------
require_dir "$BACKEND"
require_dir "$FRONTEND"
require_bin "$PHP_BIN"
require_bin "$COMPOSER_BIN"
require_bin "$NPM_BIN"
require_bin "$PM2_BIN"

log "Project root: $ROOT"

START_TS=$(date +%s)

# ---------------------------------------------------------------------------
# Backend.
# ---------------------------------------------------------------------------

if [[ $DO_COMPOSER -eq 1 ]]; then
    # Без --no-dev: на dev нужны faker/pint/phpunit. Иначе db:seed
    # падает на `Call to undefined function fake()` в UserFactory.
    log "composer install (с dev-зависимостями)"
    (
        cd "$BACKEND"
        COMPOSER_MEMORY_LIMIT="$COMPOSER_MEMORY_LIMIT" \
            "$COMPOSER_BIN" install --no-interaction --prefer-dist
    )
    # Принудительный dump-autoload после install.
    #
    # Зачем: если `composer.lock` не менялся, `install` может пропустить
    # перегенерацию autoload'а. А у нас PSR-4 маппинги модулей (Modules/*/)
    # подтягиваются через wikimedia/composer-merge-plugin из
    # `Modules/*/composer.json`. Если эти файлы приехали по SFTP ПОСЛЕ
    # первого `install` (типичная гонка при добавлении нового модуля),
    # маппинг в autoload не попадёт, и IDE/PHPStan будут ругаться
    # «Undefined type Modules\\ImportExport\\...», хотя Laravel при этом
    # через nwidart/laravel-modules будет работать корректно.
    # `dump-autoload` перечитывает merge-include glob и гарантированно
    # добавляет все Modules/* в autoload_psr4.php.
    (cd "$BACKEND" && "$COMPOSER_BIN" dump-autoload --no-interaction)
    ok "composer готов"
fi

if [[ $DO_CACHE_CLEAR -eq 1 ]]; then
    # Именно clear (НЕ cache): на dev удобнее видеть правки сразу,
    # без пересборки кешей.
    log "artisan *:clear"
    (
        cd "$BACKEND"
        "$PHP_BIN" artisan config:clear
        "$PHP_BIN" artisan route:clear
        "$PHP_BIN" artisan view:clear
        "$PHP_BIN" artisan cache:clear
    )
    ok "кеши очищены"
fi

if [[ $DO_MIGRATE -eq 1 ]]; then
    log "artisan migrate --force"
    (cd "$BACKEND" && "$PHP_BIN" artisan migrate --force)
    ok "миграции прогнаны"
fi

if [[ $DO_SEED -eq 1 ]]; then
    log "artisan db:seed --force"
    (cd "$BACKEND" && "$PHP_BIN" artisan db:seed --force)
    ok "сидеры прогнаны"
fi

if [[ $DO_QUEUE_RESTART -eq 1 ]]; then
    # queue:restart сигналит работающим воркерам выйти после текущего job'а;
    # supervisor поднимает их заново с новым кодом. Это мягче, чем
    # supervisorctl restart (тот рвёт текущий job на середине).
    log "artisan queue:restart + supervisorctl restart $QUEUE_GROUP"
    (cd "$BACKEND" && "$PHP_BIN" artisan queue:restart)
    if command -v supervisorctl >/dev/null 2>&1; then
        supervisorctl restart "$QUEUE_GROUP" || warn "supervisorctl restart не прошёл (проверь имя группы: $QUEUE_GROUP)"
    else
        warn "supervisorctl не найден — пропустил restart"
    fi
    ok "queue worker перезапущен"
fi

# ---------------------------------------------------------------------------
# Frontend.
# ---------------------------------------------------------------------------

if [[ $DO_FRONTEND_DEPS -eq 1 ]]; then
    log "npm $FRONTEND_NPM_SUBCMD (frontend)"
    (cd "$FRONTEND" && "$NPM_BIN" "$FRONTEND_NPM_SUBCMD" --no-audit --no-fund --prefer-offline --progress=false)
    ok "frontend deps установлены"
fi

if [[ $DO_FRONTEND_BUILD -eq 1 ]]; then
    # На dev фронт обычно крутится в режиме `next dev` под pm2 (HMR сам
    # перезапускается при изменении файлов). `npm run build` тут — как
    # ранняя проверка: если билд сломан, лучше упасть сейчас, а не
    # при релизе в prod.
    log "npm run build (smoke-check)"
    (cd "$FRONTEND" && "$NPM_BIN" run build)
    ok "frontend билд прошёл"
fi

if [[ $DO_FRONTEND_RELOAD -eq 1 ]]; then
    log "pm2: $FRONT_APP_NAME"
    if command -v "$PM2_BIN" >/dev/null 2>&1; then
        if "$PM2_BIN" describe "$FRONT_APP_NAME" >/dev/null 2>&1; then
            "$PM2_BIN" reload "$FRONT_APP_NAME" --update-env
            ok "pm2 reload ($FRONT_APP_NAME)"
        else
            warn "процесса $FRONT_APP_NAME нет в pm2 (часто после «pm2 kill» или первый деплой) — стартую frontend/ecosystem.config.cjs"
            (cd "$FRONTEND" && "$PM2_BIN" start ecosystem.config.cjs)
            "$PM2_BIN" save >/dev/null 2>&1 || true
            ok "pm2: приложение запущено ($FRONT_APP_NAME)"
        fi
    else
        warn "pm2 не найден — пропустил reload"
    fi
fi

# ---------------------------------------------------------------------------
# Итог.
# ---------------------------------------------------------------------------

ELAPSED=$(( $(date +%s) - START_TS ))
log "Готово за ${ELAPSED}s"

LARAVEL_LOG="$BACKEND/storage/logs/laravel.log"

if [[ $TAIL_LOGS -eq 1 ]]; then
    log "Tail -F логов (Ctrl+C чтобы выйти)"
    # Одновременно laravel.log (backend) и pm2 logs (frontend).
    # Если laravel.log ещё не создан — touch'им, чтобы tail не падал.
    touch "$LARAVEL_LOG" 2>/dev/null || true
    tail -n 20 -F "$LARAVEL_LOG" &
    TAIL_PID=$!
    trap 'kill $TAIL_PID 2>/dev/null || true' EXIT
    "$PM2_BIN" logs "$FRONT_APP_NAME" --lines 20
else
    log "Последние 20 строк laravel.log:"
    if [[ -f "$LARAVEL_LOG" ]]; then
        tail -n 20 "$LARAVEL_LOG"
    else
        printf '(лог пуст или отсутствует: %s)\n' "$LARAVEL_LOG"
    fi
fi
