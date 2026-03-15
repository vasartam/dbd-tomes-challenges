#!/bin/bash
# Скрипт деплоя — запускается на сервере через GitHub Actions.
# Ожидает, что репозиторий уже склонирован в /srv/dbd-tomes-challenges.
set -e

APP_DIR="/srv/dbd-tomes-challenges"
echo "=== Deploy started at $(date) ==="

cd "$APP_DIR"

# ── 1. Получаем свежий код ────────────────────────────────────────────────────
git pull origin master

# ── 2. Backend: обновляем зависимости Python ─────────────────────────────────
source venv/bin/activate
pip install -q -r requirements.txt
deactivate

# ── 3. Frontend: устанавливаем зависимости и собираем ────────────────────────
cd frontend
yarn install --frozen-lockfile
yarn build
cd ..

# ── 4. Перезапускаем сервисы ──────────────────────────────────────────────────
sudo systemctl restart dbd-backend
sudo systemctl restart dbd-frontend

echo "=== Deploy finished at $(date) ==="
