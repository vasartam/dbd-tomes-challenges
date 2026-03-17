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

# ── 5. Certbot хуки для автообновления сертификата ───────────────────────────
PRE_HOOK="/etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh"
POST_HOOK="/etc/letsencrypt/renewal-hooks/post/start-nginx.sh"

if [ ! -f "$PRE_HOOK" ]; then
    cat > "$PRE_HOOK" << 'EOF'
#!/bin/bash
cd /srv/dbd-tomes-challenges
docker compose stop nginx
EOF
    chmod +x "$PRE_HOOK"
    echo "Created certbot pre-hook"
fi

if [ ! -f "$POST_HOOK" ]; then
    cat > "$POST_HOOK" << 'EOF'
#!/bin/bash
cd /srv/dbd-tomes-challenges
docker compose start nginx
EOF
    chmod +x "$POST_HOOK"
    echo "Created certbot post-hook"
fi

echo "=== Deploy finished at $(date) ==="
