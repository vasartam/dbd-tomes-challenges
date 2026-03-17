#!/bin/bash
# Скачивает db.sqlite с продакшн-сервера по SSH.
#
# Использование:
#   ./deploy/pull_db.sh [ssh-хост]
#
# Если хост не передан аргументом, берётся из переменной окружения PROD_SSH_HOST,
# иначе используется значение по умолчанию из DEFAULT_HOST ниже.
#
# Примеры:
#   ./deploy/pull_db.sh
#   ./deploy/pull_db.sh user@example.com
#   PROD_SSH_HOST=user@example.com ./deploy/pull_db.sh

set -e

LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Загружаем переменные из .env ──────────────────────────────────────────────
ENV_FILE="$LOCAL_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
fi

REMOTE_PATH="/srv/dbd-tomes-challenges/db.sqlite"
BACKUP_SUFFIX=".bak.$(date +%Y%m%d_%H%M%S)"

# ── Определяем хост: аргумент > .env > ошибка ─────────────────────────────────
SSH_HOST="${1:-$PROD_SSH_HOST}"
if [ -z "$SSH_HOST" ]; then
    echo "Ошибка: SSH-хост не задан." >&2
    echo "Укажите его аргументом, переменной PROD_SSH_HOST в .env или при вызове скрипта." >&2
    exit 1
fi

# ── SSH-ключ (опционально) ────────────────────────────────────────────────────
SCP_OPTS=()
if [ -n "$PROD_SSH_KEY" ]; then
    SCP_OPTS+=(-i "$PROD_SSH_KEY")
fi

echo "=== Скачивание базы данных с $SSH_HOST ==="
echo "    Удалённый путь : $REMOTE_PATH"
echo "    Локальный путь : $LOCAL_DIR/db.sqlite"
[ -n "$PROD_SSH_KEY" ] && echo "    SSH-ключ       : $PROD_SSH_KEY"

# ── Создаём резервную копию текущей БД, если она существует ──────────────────
if [ -f "$LOCAL_DIR/db.sqlite" ]; then
    cp "$LOCAL_DIR/db.sqlite" "$LOCAL_DIR/db.sqlite${BACKUP_SUFFIX}"
    echo "    Резервная копия: db.sqlite${BACKUP_SUFFIX}"
fi

# ── Скачиваем файл через scp ──────────────────────────────────────────────────
scp "${SCP_OPTS[@]}" "$SSH_HOST:$REMOTE_PATH" "$LOCAL_DIR/db.sqlite"

echo "=== Готово: $(du -sh "$LOCAL_DIR/db.sqlite" | cut -f1) ==="