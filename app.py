#!/usr/bin/env python3
"""
DBD Tomes Challenges — backend API.
Flask + SQLite3 + JWT-аутентификация.

Данные каталога: dbd.tricky.lol/api/archives (публичный API, авторизация не нужна).

Запуск (development):
    python app.py

Запуск (production):
    APP_ENV=production python app.py

Переменные окружения (задаются в файле .env):
    APP_ENV        — режим запуска: development (по умолчанию) или production
    JWT_SECRET_KEY — секрет для подписи JWT-токенов
    DB_PATH        — путь к файлу SQLite
    PORT           — порт сервера
"""

import json
import os
import re
import sqlite3
import sys
from datetime import timedelta
from functools import wraps

import requests
from dotenv import load_dotenv

load_dotenv()
from flask import Flask, g, jsonify, request
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
)
from werkzeug.security import check_password_hash, generate_password_hash

# ─── Конфигурация ─────────────────────────────────────────────────────────────

DB_PATH = os.environ["DB_PATH"]
ARCHIVES_URL = "https://dbd.tricky.lol/api/archives"

# Никнейм: латинские буквы/цифры/_, не начинается и не заканчивается на _
NICKNAME_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9_]*[a-zA-Z0-9])?$")

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.environ["JWT_SECRET_KEY"]
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)
jwt = JWTManager(app)


# ─── База данных ──────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    """Соединение с БД, привязанное к контексту запроса Flask."""
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db:
        db.close()


def init_db():
    """Создаёт все таблицы при первом запуске."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
        -- Пользователи
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            is_admin      INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        -- Тома / архивные события (Tome01, Anniversary2022, ...)
        --   archive_key — ключ из API, напр. "Tome01" или "Halloween2024"
        --   start_ts / end_ts — Unix-timestamp начала и конца события
        CREATE TABLE IF NOT EXISTS tomes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            archive_key TEXT    NOT NULL UNIQUE,
            name        TEXT,
            start_ts    INTEGER,
            end_ts      INTEGER
        );

        -- Страницы / уровни тома (каждый том содержит несколько страниц)
        CREATE TABLE IF NOT EXISTS pages (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            tome_id      INTEGER NOT NULL REFERENCES tomes(id) ON DELETE CASCADE,
            level_number INTEGER NOT NULL,
            UNIQUE(tome_id, level_number)
        );

        -- Задания
        --   challenge_key — составной ключ вида {archive_key}_L{level}_N{index}
        --   role          — survivor / killer / shared
        --   objective     — описание задания (может содержать HTML-теги)
        --   rewards       — JSON-массив наград: [{type, id, amount}, ...]
        CREATE TABLE IF NOT EXISTS challenges (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id       INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            challenge_key TEXT    NOT NULL UNIQUE,
            node_index    INTEGER NOT NULL,
            name          TEXT,
            role          TEXT,
            objective     TEXT,
            rewards       TEXT
        );

        -- Прогресс пользователей по заданиям
        CREATE TABLE IF NOT EXISTS user_challenge_progress (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
            completed    INTEGER NOT NULL DEFAULT 0,
            updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, challenge_id)
        );
    """)
    # Миграция: добавить is_admin, если колонки ещё нет (БД из старой версии)
    try:
        conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # колонка уже существует

    conn.commit()
    conn.close()


# ─── Вспомогательные функции ──────────────────────────────────────────────────

def row_to_dict(row) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    # Автоматически десериализуем JSON-поле rewards
    if "rewards" in d and isinstance(d["rewards"], str):
        try:
            d["rewards"] = json.loads(d["rewards"])
        except (ValueError, TypeError):
            pass
    return d


def validate_username(username: str) -> bool:
    return bool(NICKNAME_RE.match(username))


def admin_required(fn):
    """Декоратор: JWT обязателен, пользователь должен быть админом."""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user_id = int(get_jwt_identity())
        db = get_db()
        row = db.execute("SELECT is_admin FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row or not row["is_admin"]:
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


# ─── Авторизация ──────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register():
    """
    Регистрация нового пользователя.
    Body: { "username": "...", "password": "..." }
    Ответ 201: { "message": "Registered successfully" }
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    if not validate_username(username):
        return jsonify({
            "error": (
                "Invalid username. Use Latin letters, digits and underscore. "
                "Underscore cannot be the first or last character."
            )
        }), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already taken"}), 409

    return jsonify({"message": "Registered successfully"}), 201


@app.post("/api/auth/login")
def login():
    """
    Вход в систему. Возвращает JWT access_token.
    Body: { "username": "...", "password": "..." }
    Ответ 200: { "access_token": "...", "username": "..." }
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=str(row["id"]))
    return jsonify({"access_token": token, "username": username})


# ─── Профиль пользователя ─────────────────────────────────────────────────────

@app.get("/api/user/profile")
@jwt_required()
def get_profile():
    """
    Профиль текущего пользователя. Требует JWT.
    Ответ 200: { "id", "username", "created_at" }
    """
    user_id = int(get_jwt_identity())
    db = get_db()
    row = db.execute(
        "SELECT id, username, is_admin, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404
    return jsonify(row_to_dict(row))


# ─── Каталог ──────────────────────────────────────────────────────────────────

@app.get("/api/tomes")
def list_tomes():
    """
    Список всех томов / архивных событий.
    Ответ 200: [ { id, archive_key, name, start_ts, end_ts }, ... ]
    """
    db = get_db()
    rows = db.execute("SELECT * FROM tomes ORDER BY id").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.get("/api/tomes/<archive_key>")
def get_tome(archive_key: str):
    """
    Том со списком его страниц.
    Ответ 200: { ...tome, pages: [ { id, level_number }, ... ] }
    """
    db = get_db()
    tome = db.execute(
        "SELECT * FROM tomes WHERE archive_key = ?", (archive_key,)
    ).fetchone()
    if not tome:
        return jsonify({"error": "Tome not found"}), 404

    pages = db.execute(
        "SELECT * FROM pages WHERE tome_id = ? ORDER BY level_number",
        (tome["id"],),
    ).fetchall()

    result = row_to_dict(tome)
    result["pages"] = [row_to_dict(p) for p in pages]
    return jsonify(result)


@app.get("/api/pages/<int:page_id>")
def get_page(page_id: int):
    """
    Страница со списком заданий.
    Ответ 200: { ...page, challenges: [ { challenge_key, name, role, objective, rewards }, ... ] }
    """
    db = get_db()
    page = db.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()
    if not page:
        return jsonify({"error": "Page not found"}), 404

    challenges = db.execute(
        "SELECT * FROM challenges WHERE page_id = ? ORDER BY node_index",
        (page_id,),
    ).fetchall()

    result = row_to_dict(page)
    result["challenges"] = [row_to_dict(c) for c in challenges]
    return jsonify(result)


@app.get("/api/challenges")
def list_challenges():
    """
    Список заданий с фильтрацией.
    Query params:
      tome    — archive_key тома
      page_id — id страницы
      role    — survivor / killer / shared
      q       — поиск по названию и описанию
    """
    db = get_db()
    tome_filter = request.args.get("tome")
    page_filter = request.args.get("page_id")
    role_filter = request.args.get("role")
    search = request.args.get("q", "").strip()

    query = """
        SELECT c.*, p.level_number, t.archive_key, t.name AS tome_name
        FROM   challenges c
        JOIN   pages      p ON c.page_id = p.id
        JOIN   tomes      t ON p.tome_id = t.id
        WHERE  1=1
    """
    params: list = []

    if tome_filter:
        query += " AND t.archive_key = ?"
        params.append(tome_filter)
    if page_filter:
        query += " AND p.id = ?"
        params.append(page_filter)
    if role_filter:
        query += " AND c.role = ?"
        params.append(role_filter)
    if search:
        query += " AND (c.name LIKE ? OR c.objective LIKE ?)"
        params += [f"%{search}%", f"%{search}%"]

    query += " ORDER BY t.id, p.level_number, c.node_index"

    rows = db.execute(query, params).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.get("/api/challenges/<challenge_key>")
def get_challenge(challenge_key: str):
    """
    Одно задание со сведениями о томе и странице.
    Ответ 200: { challenge_key, name, role, objective, rewards, level_number, archive_key, tome_name }
    """
    db = get_db()
    row = db.execute(
        """SELECT c.*, p.level_number, t.archive_key, t.name AS tome_name
           FROM   challenges c
           JOIN   pages      p ON c.page_id = p.id
           JOIN   tomes      t ON p.tome_id = t.id
           WHERE  c.challenge_key = ?""",
        (challenge_key,),
    ).fetchone()
    if not row:
        return jsonify({"error": "Challenge not found"}), 404
    return jsonify(row_to_dict(row))


# ─── Прогресс пользователя ────────────────────────────────────────────────────

@app.get("/api/user/progress")
@jwt_required()
def get_progress():
    """
    Прогресс текущего пользователя по всем заданиям. Требует JWT.
    Возвращает только задания, для которых есть запись (completed = 0 или 1).
    Ответ 200: [ { challenge_key, completed, updated_at, ... }, ... ]
    """
    user_id = int(get_jwt_identity())
    db = get_db()

    rows = db.execute(
        """SELECT ucp.completed, ucp.updated_at,
                  c.challenge_key, c.name AS challenge_name, c.role,
                  p.level_number, t.archive_key, t.name AS tome_name
           FROM   user_challenge_progress ucp
           JOIN   challenges c ON ucp.challenge_id = c.id
           JOIN   pages      p ON c.page_id        = p.id
           JOIN   tomes      t ON p.tome_id         = t.id
           WHERE  ucp.user_id = ?
           ORDER  BY t.id, p.level_number, c.node_index""",
        (user_id,),
    ).fetchall()

    return jsonify([row_to_dict(r) for r in rows])


@app.put("/api/user/progress/<challenge_key>")
@jwt_required()
def set_progress(challenge_key: str):
    """
    Установить признак выполненности задания. Требует JWT.
    Body: { "completed": true / false }
    Ответ 200: { "challenge_key": "...", "completed": true/false }
    """
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    completed = int(bool(data.get("completed", False)))

    db = get_db()
    challenge = db.execute(
        "SELECT id FROM challenges WHERE challenge_key = ?", (challenge_key,)
    ).fetchone()
    if not challenge:
        return jsonify({"error": "Challenge not found"}), 404

    db.execute(
        """INSERT INTO user_challenge_progress (user_id, challenge_id, completed, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, challenge_id) DO UPDATE
               SET completed  = excluded.completed,
                   updated_at = excluded.updated_at""",
        (user_id, challenge["id"], completed),
    )
    db.commit()
    return jsonify({"challenge_key": challenge_key, "completed": bool(completed)})


# ─── Синхронизация каталога ───────────────────────────────────────────────────

@app.get("/api/admin/users")
@admin_required
def list_users():
    """
    Список всех пользователей. Только для админов.
    Ответ 200: [ { id, username, is_admin, created_at }, ... ]
    """
    db = get_db()
    rows = db.execute(
        "SELECT id, username, is_admin, created_at FROM users ORDER BY id"
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.post("/api/admin/users/<int:user_id>/toggle-admin")
@admin_required
def toggle_admin(user_id: int):
    """
    Выдать или забрать права администратора. Только для админов.
    Нельзя снять права с самого себя.
    Ответ 200: { id, username, is_admin }
    """
    current_user_id = int(get_jwt_identity())
    if current_user_id == user_id:
        return jsonify({"error": "Cannot change your own admin status"}), 400

    db = get_db()
    row = db.execute("SELECT id, username, is_admin FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404

    new_status = 0 if row["is_admin"] else 1
    db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (new_status, user_id))
    db.commit()
    return jsonify({"id": user_id, "username": row["username"], "is_admin": bool(new_status)})


@app.post("/api/admin/sync-catalog")
@admin_required
def sync_catalog():
    """
    Загрузить полный каталог томов с dbd.tricky.lol и сохранить в БД.
    Авторизация не требуется. Безопасно вызывать повторно (upsert).

    Источник данных: https://dbd.tricky.lol/api/archives
    Структура ответа:
      { "<archive_key>": { name, start, end, levels: { "<num>": { nodes: [...] } } } }

    Каждый node (задание):
      { name, role, objective, rewards: [{type, id, amount}] }
    """
    try:
        resp = requests.get(ARCHIVES_URL, timeout=30)
        resp.raise_for_status()
        archives: dict = resp.json()
    except requests.RequestException as exc:
        return jsonify({"error": f"Failed to fetch catalog: {exc}"}), 502

    if not isinstance(archives, dict):
        return jsonify({"error": "Unexpected response format from source API"}), 502

    db = get_db()
    counts = {"tomes": 0, "pages": 0, "challenges": 0}

    for archive_key, archive in archives.items():
        if not isinstance(archive, dict):
            continue

        # ── Том ──────────────────────────────────────────────────────────────
        db.execute(
            """INSERT INTO tomes (archive_key, name, start_ts, end_ts)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(archive_key) DO UPDATE
                   SET name     = excluded.name,
                       start_ts = excluded.start_ts,
                       end_ts   = excluded.end_ts""",
            (
                archive_key,
                archive.get("name"),
                archive.get("start"),
                archive.get("end"),
            ),
        )
        db.commit()
        counts["tomes"] += 1

        tome_row = db.execute(
            "SELECT id FROM tomes WHERE archive_key = ?", (archive_key,)
        ).fetchone()

        # ── Уровни / страницы ─────────────────────────────────────────────────
        levels = archive.get("levels", {})
        # Поддержка dict {"1": {...}} и list [{...}]
        if isinstance(levels, list):
            levels_items = [(i + 1, lv) for i, lv in enumerate(levels)]
        elif isinstance(levels, dict):
            def _level_sort_key(kv):
                k = kv[0]
                return int(k) if str(k).isdigit() else 0

            levels_items = [
                (int(k) if str(k).isdigit() else i, v)
                for i, (k, v) in enumerate(sorted(levels.items(), key=_level_sort_key))
            ]
        else:
            levels_items = []

        for level_number, level_data in levels_items:
            db.execute(
                """INSERT INTO pages (tome_id, level_number)
                   VALUES (?, ?)
                   ON CONFLICT(tome_id, level_number) DO NOTHING""",
                (tome_row["id"], level_number),
            )
            db.commit()
            counts["pages"] += 1

            page_row = db.execute(
                "SELECT id FROM pages WHERE tome_id = ? AND level_number = ?",
                (tome_row["id"], level_number),
            ).fetchone()

            # ── Задания / ноды ────────────────────────────────────────────────
            nodes = (
                level_data.get("nodes", [])
                if isinstance(level_data, dict)
                else []
            )
            for node_idx, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue

                challenge_key = f"{archive_key}_L{level_number}_N{node_idx}"
                rewards_json = json.dumps(
                    node.get("rewards", []), ensure_ascii=False
                )

                db.execute(
                    """INSERT INTO challenges
                           (page_id, challenge_key, node_index, name, role, objective, rewards)
                       VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(challenge_key) DO UPDATE
                           SET name      = excluded.name,
                               role      = excluded.role,
                               objective = excluded.objective,
                               rewards   = excluded.rewards""",
                    (
                        page_row["id"],
                        challenge_key,
                        node_idx,
                        node.get("name"),
                        node.get("role"),
                        node.get("objective"),
                        rewards_json,
                    ),
                )
                counts["challenges"] += 1

        db.commit()

    return jsonify({
        "message": "Catalog synced successfully",
        "tomes": counts["tomes"],
        "pages": counts["pages"],
        "challenges": counts["challenges"],
    })


# ─── Точка входа ──────────────────────────────────────────────────────────────

def make_admin(username: str):
    """Назначить пользователя администратором (CLI-утилита)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not row:
        print(f"Пользователь '{username}' не найден.")
        conn.close()
        sys.exit(1)
    conn.execute("UPDATE users SET is_admin = 1 WHERE username = ?", (username,))
    conn.commit()
    conn.close()
    print(f"Пользователь '{username}' теперь администратор.")


if __name__ == "__main__":
    init_db()

    # python app.py --make-admin <username>
    if "--make-admin" in sys.argv:
        idx = sys.argv.index("--make-admin")
        if idx + 1 >= len(sys.argv):
            print("Укажите имя пользователя: python app.py --make-admin <username>")
            sys.exit(1)
        make_admin(sys.argv[idx + 1])
        sys.exit(0)

    port = int(os.environ["PORT"])
    env = os.environ.get("APP_ENV", "development")

    if env == "production":
        from waitress import serve
        print(f"Starting production server on http://0.0.0.0:{port}")
        serve(app, host="0.0.0.0", port=port)
    else:
        print(f"Starting development server on http://0.0.0.0:{port}")
        app.run(debug=True, host="0.0.0.0", port=port)