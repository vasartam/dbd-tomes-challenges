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

    # Миграция: добавить колонки позиций для древовидной структуры
    for col_def in ["grid_column INTEGER", "grid_row INTEGER"]:
        try:
            conn.execute(f"ALTER TABLE challenges ADD COLUMN {col_def}")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # колонка уже существует

    # Миграция: создать таблицу зависимостей между заданиями
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS challenge_dependencies (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                child_id  INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
                parent_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
                UNIQUE(child_id, parent_id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dep_child ON challenge_dependencies(child_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dep_parent ON challenge_dependencies(parent_id)")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # таблица уже существует

    # Миграция: добавить колонки для русского языка
    for col_def in ["name_ru TEXT", "objective_ru TEXT"]:
        try:
            conn.execute(f"ALTER TABLE challenges ADD COLUMN {col_def}")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # колонка уже существует

    conn.commit()
    conn.close()


# ─── Вспомогательные функции ──────────────────────────────────────────────────

SUPPORTED_LANGS = {"en", "ru"}
DEFAULT_LANG = "en"


def get_request_lang() -> str:
    """Получить язык из запроса (query param или header)."""
    lang = request.args.get("lang", "").lower()
    if lang in SUPPORTED_LANGS:
        return lang
    # Проверяем Accept-Language header
    accept_lang = request.headers.get("Accept-Language", "").lower()
    if accept_lang.startswith("ru"):
        return "ru"
    return DEFAULT_LANG


def localize_challenge(d: dict, lang: str) -> dict:
    """Применить локализацию к заданию."""
    if lang == "ru":
        if d.get("name_ru"):
            d["name"] = d["name_ru"]
        if d.get("objective_ru"):
            d["objective"] = d["objective_ru"]
    # Удаляем технические поля перевода
    d.pop("name_ru", None)
    d.pop("objective_ru", None)
    return d


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
    Query params:
      lang — язык (en/ru)
    Ответ 200: { ...page, challenges: [ { challenge_key, name, role, objective, rewards }, ... ] }
    """
    lang = get_request_lang()
    db = get_db()
    page = db.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()
    if not page:
        return jsonify({"error": "Page not found"}), 404

    challenges = db.execute(
        "SELECT * FROM challenges WHERE page_id = ? ORDER BY node_index",
        (page_id,),
    ).fetchall()

    result = row_to_dict(page)
    result["challenges"] = [localize_challenge(row_to_dict(c), lang) for c in challenges]
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
      lang    — язык (en/ru)
    """
    lang = get_request_lang()
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
        # Поиск и по английскому, и по русскому
        query += " AND (c.name LIKE ? OR c.objective LIKE ? OR c.name_ru LIKE ? OR c.objective_ru LIKE ?)"
        params += [f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"]

    query += " ORDER BY t.id, p.level_number, c.node_index"

    rows = db.execute(query, params).fetchall()
    return jsonify([localize_challenge(row_to_dict(r), lang) for r in rows])


@app.get("/api/challenges/<challenge_key>")
def get_challenge(challenge_key: str):
    """
    Одно задание со сведениями о томе и странице.
    Query params:
      lang — язык (en/ru)
    Ответ 200: { challenge_key, name, role, objective, rewards, level_number, archive_key, tome_name }
    """
    lang = get_request_lang()
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
    return jsonify(localize_challenge(row_to_dict(row), lang))


# ─── Прогресс пользователя ────────────────────────────────────────────────────

@app.get("/api/user/progress")
@jwt_required()
def get_progress():
    """
    Прогресс текущего пользователя по всем заданиям. Требует JWT.
    Query params:
      lang — язык (en/ru)
    Возвращает только задания, для которых есть запись (completed = 0 или 1).
    Ответ 200: [ { challenge_key, completed, updated_at, ... }, ... ]
    """
    lang = get_request_lang()
    user_id = int(get_jwt_identity())
    db = get_db()

    rows = db.execute(
        """SELECT ucp.completed, ucp.updated_at,
                  c.challenge_key, c.name AS challenge_name, c.name_ru AS challenge_name_ru, c.role,
                  p.level_number, t.archive_key, t.name AS tome_name
           FROM   user_challenge_progress ucp
           JOIN   challenges c ON ucp.challenge_id = c.id
           JOIN   pages      p ON c.page_id        = p.id
           JOIN   tomes      t ON p.tome_id         = t.id
           WHERE  ucp.user_id = ?
           ORDER  BY t.id, p.level_number, c.node_index""",
        (user_id,),
    ).fetchall()

    result = []
    for r in rows:
        d = row_to_dict(r)
        if lang == "ru" and d.get("challenge_name_ru"):
            d["challenge_name"] = d["challenge_name_ru"]
        d.pop("challenge_name_ru", None)
        result.append(d)

    return jsonify(result)


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
    Загружает данные на английском и русском языках.
    Безопасно вызывать повторно (upsert).
    """
    try:
        # Загрузить английскую версию
        resp_en = requests.get(ARCHIVES_URL, timeout=30)
        resp_en.raise_for_status()
        archives_en: dict = resp_en.json()

        # Загрузить русскую версию
        resp_ru = requests.get(ARCHIVES_URL, timeout=30, headers={"Accept-Language": "ru"})
        resp_ru.raise_for_status()
        archives_ru: dict = resp_ru.json()
    except requests.RequestException as exc:
        return jsonify({"error": f"Failed to fetch catalog: {exc}"}), 502

    if not isinstance(archives_en, dict) or not isinstance(archives_ru, dict):
        return jsonify({"error": "Unexpected response format from source API"}), 502

    db = get_db()
    counts = {"tomes": 0, "pages": 0, "challenges": 0}

    for archive_key, archive in archives_en.items():
        if not isinstance(archive, dict):
            continue

        # Русская версия архива
        archive_ru = archives_ru.get(archive_key, {})

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
        # Русские уровни
        levels_ru = archive_ru.get("levels", {}) if isinstance(archive_ru, dict) else {}

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

            # Русские ноды
            level_ru = levels_ru.get(str(level_number), levels_ru.get(level_number, {}))
            if isinstance(levels_ru, list):
                level_ru = levels_ru[level_number - 1] if level_number - 1 < len(levels_ru) else {}
            nodes_ru = level_ru.get("nodes", []) if isinstance(level_ru, dict) else []

            for node_idx, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue

                challenge_key = f"{archive_key}_L{level_number}_N{node_idx}"
                rewards_json = json.dumps(
                    node.get("rewards", []), ensure_ascii=False
                )

                # Русский перевод
                node_ru = nodes_ru[node_idx] if node_idx < len(nodes_ru) else {}
                name_ru = node_ru.get("name") if isinstance(node_ru, dict) else None
                objective_ru = node_ru.get("objective") if isinstance(node_ru, dict) else None

                db.execute(
                    """INSERT INTO challenges
                           (page_id, challenge_key, node_index, name, role, objective, rewards, name_ru, objective_ru)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(challenge_key) DO UPDATE
                           SET name        = excluded.name,
                               role        = excluded.role,
                               objective   = excluded.objective,
                               rewards     = excluded.rewards,
                               name_ru     = excluded.name_ru,
                               objective_ru = excluded.objective_ru""",
                    (
                        page_row["id"],
                        challenge_key,
                        node_idx,
                        node.get("name"),
                        node.get("role"),
                        node.get("objective"),
                        rewards_json,
                        name_ru,
                        objective_ru,
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


# ─── Зависимости между заданиями ──────────────────────────────────────────────

@app.get("/api/pages/<int:page_id>/dependencies")
def get_page_dependencies(page_id: int):
    """
    Граф зависимостей для страницы.
    Ответ 200: { challenges: [...], dependencies: [{ child_id, parent_id }] }
    """
    lang = get_request_lang()
    db = get_db()

    page = db.execute("SELECT id FROM pages WHERE id = ?", (page_id,)).fetchone()
    if not page:
        return jsonify({"error": "Page not found"}), 404

    challenges = db.execute("""
        SELECT id, challenge_key, name, role, objective, grid_column, grid_row, name_ru, objective_ru
        FROM challenges
        WHERE page_id = ?
        ORDER BY node_index
    """, (page_id,)).fetchall()

    if not challenges:
        return jsonify({"challenges": [], "dependencies": []})

    challenge_ids = [c["id"] for c in challenges]
    placeholders = ",".join("?" * len(challenge_ids))

    dependencies = db.execute(f"""
        SELECT child_id, parent_id
        FROM challenge_dependencies
        WHERE child_id IN ({placeholders})
    """, challenge_ids).fetchall()

    return jsonify({
        "challenges": [localize_challenge(row_to_dict(c), lang) for c in challenges],
        "dependencies": [{"child_id": d["child_id"], "parent_id": d["parent_id"]} for d in dependencies]
    })


@app.put("/api/admin/challenges/<challenge_key>/position")
@admin_required
def set_challenge_position(challenge_key: str):
    """
    Установить позицию задания в сетке. Только для админов.
    Body: { "grid_column": 5, "grid_row": 3 }
    Ответ 200: { challenge_key, grid_column, grid_row }
    """
    db = get_db()
    data = request.get_json(silent=True) or {}

    grid_column = data.get("grid_column")
    grid_row = data.get("grid_row")

    if grid_column is None or grid_row is None:
        return jsonify({"error": "grid_column and grid_row are required"}), 400

    result = db.execute("""
        UPDATE challenges
        SET grid_column = ?, grid_row = ?
        WHERE challenge_key = ?
    """, (grid_column, grid_row, challenge_key))

    if result.rowcount == 0:
        return jsonify({"error": "Challenge not found"}), 404

    db.commit()
    return jsonify({"challenge_key": challenge_key, "grid_column": grid_column, "grid_row": grid_row})


@app.post("/api/admin/challenges/<challenge_key>/dependencies")
@admin_required
def set_challenge_dependencies(challenge_key: str):
    """
    Установить зависимости задания (заменяет все существующие). Только для админов.
    Body: { "parent_keys": ["Tome01_L1_N0", "Tome01_L1_N2"] }
    Ответ 200: { challenge_key, parent_keys }
    """
    db = get_db()
    data = request.get_json(silent=True) or {}
    parent_keys = data.get("parent_keys", [])

    challenge = db.execute(
        "SELECT id FROM challenges WHERE challenge_key = ?", (challenge_key,)
    ).fetchone()
    if not challenge:
        return jsonify({"error": "Challenge not found"}), 404

    # Удалить существующие зависимости
    db.execute("DELETE FROM challenge_dependencies WHERE child_id = ?", (challenge["id"],))

    # Добавить новые зависимости
    valid_parent_keys = []
    for parent_key in parent_keys:
        parent = db.execute(
            "SELECT id FROM challenges WHERE challenge_key = ?", (parent_key,)
        ).fetchone()
        if parent and parent["id"] != challenge["id"]:  # нельзя зависеть от себя
            db.execute("""
                INSERT INTO challenge_dependencies (child_id, parent_id)
                VALUES (?, ?)
            """, (challenge["id"], parent["id"]))
            valid_parent_keys.append(parent_key)

    db.commit()
    return jsonify({"challenge_key": challenge_key, "parent_keys": valid_parent_keys})


@app.post("/api/admin/pages/<int:page_id>/auto-layout")
@admin_required
def auto_layout_page(page_id: int):
    """
    Автоматически расставить позиции и зависимости для страницы. Только для админов.
    Создаёт линейную расстановку как начальную точку.
    Ответ 200: { message, challenges_updated }
    """
    db = get_db()

    page = db.execute("SELECT id FROM pages WHERE id = ?", (page_id,)).fetchone()
    if not page:
        return jsonify({"error": "Page not found"}), 404

    challenges = db.execute("""
        SELECT id, challenge_key, node_index
        FROM challenges
        WHERE page_id = ?
        ORDER BY node_index
    """, (page_id,)).fetchall()

    if not challenges:
        return jsonify({"error": "No challenges found"}), 404

    # Авто-расстановка: линейная по центру сетки
    grid_width = 13  # Стандартная ширина сетки DBD
    center_col = grid_width // 2

    for i, challenge in enumerate(challenges):
        grid_row = i
        grid_col = center_col

        db.execute("""
            UPDATE challenges
            SET grid_column = ?, grid_row = ?
            WHERE id = ?
        """, (grid_col, grid_row, challenge["id"]))

        # Линейная зависимость: предыдущее -> текущее
        if i > 0:
            db.execute("""
                INSERT OR IGNORE INTO challenge_dependencies (child_id, parent_id)
                VALUES (?, ?)
            """, (challenge["id"], challenges[i - 1]["id"]))

    db.commit()
    return jsonify({"message": "Auto-layout applied", "challenges_updated": len(challenges)})


# ─── Статус выполнения ────────────────────────────────────────────────────────

def is_prologue(name: str | None) -> bool:
    return name is not None and name.lower() == "prologue"


def is_epilogue(name: str | None) -> bool:
    return name is not None and name.lower() == "epilogue"


def check_page_completion(db: sqlite3.Connection, page_id: int, user_id: int) -> dict:
    """
    Проверить выполнение страницы.
    Страница выполнена, если есть путь от любого пролога до любого эпилога,
    где все задания на пути выполнены.
    """
    # Получить все задания страницы
    challenges = db.execute("""
        SELECT c.id, c.name, c.challenge_key
        FROM challenges c
        WHERE c.page_id = ?
    """, (page_id,)).fetchall()

    if not challenges:
        return {"is_complete": False, "reason": "no_challenges"}

    challenge_ids = {c["id"] for c in challenges}

    # Прологи и эпилоги
    prologue_ids = {c["id"] for c in challenges if is_prologue(c["name"])}
    epilogue_ids = {c["id"] for c in challenges if is_epilogue(c["name"])}

    if not prologue_ids or not epilogue_ids:
        return {"is_complete": False, "reason": "no_prologue_or_epilogue"}

    # Выполненные задания
    completed_rows = db.execute("""
        SELECT challenge_id
        FROM user_challenge_progress
        WHERE user_id = ? AND completed = 1 AND challenge_id IN ({})
    """.format(",".join("?" * len(challenge_ids))), [user_id] + list(challenge_ids)).fetchall()
    completed_ids = {r["challenge_id"] for r in completed_rows}

    # Зависимости
    deps = db.execute("""
        SELECT child_id, parent_id
        FROM challenge_dependencies
        WHERE child_id IN ({})
    """.format(",".join("?" * len(challenge_ids))), list(challenge_ids)).fetchall()

    # Построить граф: parent -> children
    children_map: dict[int, set[int]] = {}
    for d in deps:
        children_map.setdefault(d["parent_id"], set()).add(d["child_id"])

    # BFS от прологов к эпилогам
    # Ищем путь, где все узлы выполнены
    from collections import deque

    for start_id in prologue_ids:
        if start_id not in completed_ids:
            continue  # пролог не выполнен

        queue = deque([start_id])
        visited = {start_id}

        while queue:
            current = queue.popleft()

            if current in epilogue_ids:
                return {"is_complete": True, "reason": "path_found"}

            for child_id in children_map.get(current, []):
                if child_id not in visited and child_id in completed_ids:
                    visited.add(child_id)
                    queue.append(child_id)

    return {"is_complete": False, "reason": "no_complete_path"}


@app.get("/api/user/tomes/<archive_key>/completion")
@jwt_required()
def get_tome_completion(archive_key: str):
    """
    Статус выполнения тома для текущего пользователя.
    Ответ 200: { archive_key, name, is_complete, pages: [...] }
    """
    user_id = int(get_jwt_identity())
    db = get_db()

    tome = db.execute(
        "SELECT id, archive_key, name FROM tomes WHERE archive_key = ?", (archive_key,)
    ).fetchone()
    if not tome:
        return jsonify({"error": "Tome not found"}), 404

    pages = db.execute(
        "SELECT id, level_number FROM pages WHERE tome_id = ? ORDER BY level_number",
        (tome["id"],)
    ).fetchall()

    pages_status = []
    for page in pages:
        result = check_page_completion(db, page["id"], user_id)
        pages_status.append({
            "page_id": page["id"],
            "level_number": page["level_number"],
            "is_complete": result["is_complete"],
        })

    tome_complete = all(p["is_complete"] for p in pages_status) if pages_status else False

    return jsonify({
        "archive_key": archive_key,
        "name": tome["name"],
        "is_complete": tome_complete,
        "pages": pages_status,
    })


@app.get("/api/user/pages/<int:page_id>/completion")
@jwt_required()
def get_page_completion(page_id: int):
    """
    Статус выполнения страницы для текущего пользователя.
    Ответ 200: { page_id, level_number, is_complete, ... }
    """
    user_id = int(get_jwt_identity())
    db = get_db()

    page = db.execute(
        "SELECT p.id, p.level_number FROM pages p WHERE p.id = ?", (page_id,)
    ).fetchone()
    if not page:
        return jsonify({"error": "Page not found"}), 404

    result = check_page_completion(db, page_id, user_id)

    return jsonify({
        "page_id": page_id,
        "level_number": page["level_number"],
        "is_complete": result["is_complete"],
        "reason": result.get("reason"),
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