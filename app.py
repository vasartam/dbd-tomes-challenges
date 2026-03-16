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
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlparse, unquote

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()
from flask import Flask, g, jsonify, request, send_from_directory
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

WIKI_BASE  = "https://deadbydaylight.fandom.com"
WIKI_API   = f"{WIKI_BASE}/api.php"
ICONS_DIR         = Path(os.environ.get("ICONS_DIR", str(Path(__file__).parent / "frontend" / "public" / "challenge_icons")))
SCRAPE_DELAY      = 0.5
_SCRAPE_STATE_FILE = Path(__file__).parent / "scrape_state.json"

# Никнейм: латинские буквы/цифры/_, не начинается и не заканчивается на _
NICKNAME_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9_]*[a-zA-Z0-9])?$")

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.environ["JWT_SECRET_KEY"]
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)
jwt = JWTManager(app)


@app.get("/challenge_icons/<path:filename>")
def serve_challenge_icon(filename: str):
    return send_from_directory(ICONS_DIR, filename)


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

    # Миграция: добавить колонки координат для графа (заменяют grid_column/grid_row)
    for col_def in ["grid_column INTEGER", "grid_row INTEGER", "pos_x REAL", "pos_y REAL"]:
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
    Страница со списком заданий и графом зависимостей между ними.
    Query params:
      lang — язык (en/ru)
    Ответ 200:
    {
      id, tome_id, level_number,
      challenges: [
        { challenge_key, name, role, objective, rewards, pos_x, pos_y },
        ...
      ],
      dependencies: [
        { a: "Tome01_L1_N0", b: "Tome01_L1_N2" },
        ...
      ]
    }
    Поле dependencies описывает ненаправленный граф связей между заданиями.
    Каждая запись означает, что задания a и b взаимосвязаны
    (выполнение одного открывает доступ к другому).
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

    # Собираем зависимости, возвращая challenge_key вместо внутренних ID
    challenge_ids = [c["id"] for c in challenges]
    id_to_key = {c["id"]: c["challenge_key"] for c in challenges}
    dependencies = []
    if challenge_ids:
        placeholders = ",".join("?" * len(challenge_ids))
        raw_deps = db.execute(f"""
            SELECT child_id, parent_id
            FROM challenge_dependencies
            WHERE child_id IN ({placeholders}) OR parent_id IN ({placeholders})
        """, challenge_ids + challenge_ids).fetchall()

        seen: set[tuple[int, int]] = set()
        for d in raw_deps:
            key = (min(d["child_id"], d["parent_id"]), max(d["child_id"], d["parent_id"]))
            if key not in seen:
                seen.add(key)
                dependencies.append({
                    "a": id_to_key[key[0]],
                    "b": id_to_key[key[1]],
                })

    result = row_to_dict(page)
    result["challenges"] = [localize_challenge(row_to_dict(c), lang) for c in challenges]
    result["dependencies"] = dependencies
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


def is_challenge_available(db: sqlite3.Connection, challenge_id: int, user_id: int) -> bool:
    """
    Проверить, доступно ли задание для выполнения данным пользователем.

    Правила:
    - Пролог на первой странице тома — всегда доступен.
    - Пролог на последующих страницах — доступен, если выполнен хотя бы один эпилог
      предыдущей страницы.
    - Остальные задания без связей — доступны.
    - Остальные задания со связями — доступны, если хотя бы один сосед выполнен.
    """
    challenge = db.execute(
        "SELECT id, name, page_id FROM challenges WHERE id = ?", (challenge_id,)
    ).fetchone()
    if not challenge:
        return False

    # ── Пролог ───────────────────────────────────────────────────────────────
    if is_prologue(challenge["name"]):
        page = db.execute(
            "SELECT id, tome_id, level_number FROM pages WHERE id = ?",
            (challenge["page_id"],)
        ).fetchone()
        if not page:
            return False

        # Первая страница тома — пролог всегда доступен
        prev_page = db.execute(
            "SELECT id FROM pages WHERE tome_id = ? AND level_number < ? ORDER BY level_number DESC LIMIT 1",
            (page["tome_id"], page["level_number"])
        ).fetchone()
        if not prev_page:
            return True

        # Иначе нужен выполненный эпилог предыдущей страницы
        epilogues = db.execute(
            "SELECT c.id FROM challenges c WHERE c.page_id = ?", (prev_page["id"],)
        ).fetchall()
        epilogue_ids = [e["id"] for e in epilogues if is_epilogue(
            db.execute("SELECT name FROM challenges WHERE id = ?", (e["id"],)).fetchone()["name"]
        )]
        if not epilogue_ids:
            return True  # нет эпилогов — считаем доступным

        placeholders = ",".join("?" * len(epilogue_ids))
        completed = db.execute(
            f"SELECT 1 FROM user_challenge_progress "
            f"WHERE user_id = ? AND completed = 1 AND challenge_id IN ({placeholders}) LIMIT 1",
            [user_id] + epilogue_ids
        ).fetchone()
        return completed is not None

    # ── Обычное задание / эпилог ──────────────────────────────────────────────
    # Получаем всех соседей (ненаправленный граф)
    neighbors = db.execute(
        """SELECT CASE WHEN child_id = ? THEN parent_id ELSE child_id END AS neighbor_id
           FROM challenge_dependencies
           WHERE child_id = ? OR parent_id = ?""",
        (challenge_id, challenge_id, challenge_id)
    ).fetchall()

    if not neighbors:
        return True  # нет связей — доступно

    neighbor_ids = [n["neighbor_id"] for n in neighbors]
    placeholders = ",".join("?" * len(neighbor_ids))
    completed = db.execute(
        f"SELECT 1 FROM user_challenge_progress "
        f"WHERE user_id = ? AND completed = 1 AND challenge_id IN ({placeholders}) LIMIT 1",
        [user_id] + neighbor_ids
    ).fetchone()
    return completed is not None


@app.put("/api/user/progress/<challenge_key>")
@jwt_required()
def set_progress(challenge_key: str):
    """
    Установить признак выполненности задания. Требует JWT.
    При попытке отметить заблокированное задание возвращает 403.
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

    # Проверяем доступность только при попытке отметить как выполненное
    if completed and not is_challenge_available(db, challenge["id"], user_id):
        return jsonify({"error": "Challenge is locked"}), 403

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
        SELECT id, challenge_key, name, role, objective, pos_x, pos_y, name_ru, objective_ru, icon_url
        FROM challenges
        WHERE page_id = ?
        ORDER BY node_index
    """, (page_id,)).fetchall()

    if not challenges:
        return jsonify({"challenges": [], "dependencies": []})

    challenge_ids = [c["id"] for c in challenges]
    placeholders = ",".join("?" * len(challenge_ids))

    # Запрашиваем связи в обоих направлениях (граф ненаправленный)
    raw_deps = db.execute(f"""
        SELECT child_id, parent_id
        FROM challenge_dependencies
        WHERE child_id IN ({placeholders}) OR parent_id IN ({placeholders})
    """, challenge_ids + challenge_ids).fetchall()

    # Убираем дубли: каждую пару возвращаем один раз
    seen: set[tuple[int, int]] = set()
    dependencies = []
    for d in raw_deps:
        key = (min(d["child_id"], d["parent_id"]), max(d["child_id"], d["parent_id"]))
        if key not in seen:
            seen.add(key)
            dependencies.append({"a_id": key[0], "b_id": key[1]})

    return jsonify({
        "challenges": [localize_challenge(row_to_dict(c), lang) for c in challenges],
        "dependencies": dependencies
    })


@app.get("/api/dependencies")
def get_bulk_dependencies():
    """
    Зависимости нескольких страниц за один запрос.
    Query params:
      page_ids — список id страниц через запятую (например: 1,2,3)
      lang     — язык (en/ru)
    Ответ 200: { "<page_id>": { "challenges": [...], "dependencies": [...] }, ... }
    """
    lang = get_request_lang()
    db = get_db()

    page_ids_str = request.args.get("page_ids", "")
    try:
        page_ids = [int(pid) for pid in page_ids_str.split(",") if pid.strip()]
    except ValueError:
        return jsonify({"error": "Invalid page_ids"}), 400

    if not page_ids:
        return jsonify({})

    placeholders = ",".join("?" * len(page_ids))

    # Загружаем все задания указанных страниц одним запросом
    rows = db.execute(f"""
        SELECT id, challenge_key, name, name_ru, role, objective, objective_ru,
               pos_x, pos_y, icon_url, page_id
        FROM challenges
        WHERE page_id IN ({placeholders})
        ORDER BY page_id, node_index
    """, page_ids).fetchall()

    # Группируем задания по странице
    challenges_by_page: dict = {pid: [] for pid in page_ids}
    challenge_to_page: dict = {}
    all_ids: list = []
    for c in rows:
        challenges_by_page[c["page_id"]].append(c)
        challenge_to_page[c["id"]] = c["page_id"]
        all_ids.append(c["id"])

    # Загружаем все зависимости одним запросом
    deps_by_page: dict = {pid: [] for pid in page_ids}
    if all_ids:
        dep_placeholders = ",".join("?" * len(all_ids))
        raw_deps = db.execute(f"""
            SELECT child_id, parent_id
            FROM challenge_dependencies
            WHERE child_id IN ({dep_placeholders}) OR parent_id IN ({dep_placeholders})
        """, all_ids + all_ids).fetchall()

        seen: set = set()
        for d in raw_deps:
            a_id = min(d["child_id"], d["parent_id"])
            b_id = max(d["child_id"], d["parent_id"])
            key = (a_id, b_id)
            if key in seen:
                continue
            seen.add(key)
            page_id = challenge_to_page.get(a_id) or challenge_to_page.get(b_id)
            if page_id in deps_by_page:
                deps_by_page[page_id].append({"a_id": a_id, "b_id": b_id})

    return jsonify({
        str(pid): {
            "challenges": [localize_challenge(row_to_dict(c), lang) for c in challenges_by_page[pid]],
            "dependencies": deps_by_page[pid],
        }
        for pid in page_ids
    })


@app.put("/api/admin/challenges/<challenge_key>/position")
@admin_required
def set_challenge_position(challenge_key: str):
    """
    Установить позицию задания на графе. Только для админов.
    Body: { "pos_x": 450.0, "pos_y": 200.0 }
    Ответ 200: { challenge_key, pos_x, pos_y }
    """
    db = get_db()
    data = request.get_json(silent=True) or {}

    pos_x = data.get("pos_x")
    pos_y = data.get("pos_y")

    if pos_x is None or pos_y is None:
        return jsonify({"error": "pos_x and pos_y are required"}), 400

    result = db.execute("""
        UPDATE challenges
        SET pos_x = ?, pos_y = ?
        WHERE challenge_key = ?
    """, (float(pos_x), float(pos_y), challenge_key))

    if result.rowcount == 0:
        return jsonify({"error": "Challenge not found"}), 404

    db.commit()
    return jsonify({"challenge_key": challenge_key, "pos_x": pos_x, "pos_y": pos_y})


@app.post("/api/admin/challenges/<challenge_key>/dependencies")
@admin_required
def set_challenge_dependencies(challenge_key: str):
    """
    Установить связи задания (заменяет все существующие). Только для админов.
    Граф ненаправленный: связи хранятся с min(id) как child_id.
    Body: { "linked_keys": ["Tome01_L1_N0", "Tome01_L1_N2"] }
    Ответ 200: { challenge_key, linked_keys }
    """
    db = get_db()
    data = request.get_json(silent=True) or {}
    linked_keys = data.get("linked_keys", [])

    challenge = db.execute(
        "SELECT id FROM challenges WHERE challenge_key = ?", (challenge_key,)
    ).fetchone()
    if not challenge:
        return jsonify({"error": "Challenge not found"}), 404

    # Удалить все связи, в которых участвует данное задание (в обоих направлениях)
    db.execute(
        "DELETE FROM challenge_dependencies WHERE child_id = ? OR parent_id = ?",
        (challenge["id"], challenge["id"])
    )

    # Добавить новые связи (храним пару как min_id, max_id)
    valid_linked_keys = []
    for linked_key in linked_keys:
        linked = db.execute(
            "SELECT id FROM challenges WHERE challenge_key = ?", (linked_key,)
        ).fetchone()
        if linked and linked["id"] != challenge["id"]:
            a_id = min(challenge["id"], linked["id"])
            b_id = max(challenge["id"], linked["id"])
            db.execute(
                "INSERT OR IGNORE INTO challenge_dependencies (child_id, parent_id) VALUES (?, ?)",
                (a_id, b_id)
            )
            valid_linked_keys.append(linked_key)

    db.commit()
    return jsonify({"challenge_key": challenge_key, "linked_keys": valid_linked_keys})


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

    # Авто-расстановка в виртуальном пространстве 900×580
    # Пролог вверху, эпилог внизу, остальные — в центре сеткой
    CANVAS_W, CANVAS_H = 900.0, 580.0
    CENTER_X = CANVAS_W / 2

    prologues = [c for c in challenges if is_prologue(c["name"])]
    epilogues  = [c for c in challenges if is_epilogue(c["name"])]
    others     = [c for c in challenges if not is_prologue(c["name"]) and not is_epilogue(c["name"])]

    def spread(items, y, canvas_w):
        """Равномерно распределить items по горизонтали на высоте y."""
        n = len(items)
        for j, item in enumerate(items):
            x = canvas_w / (n + 1) * (j + 1)
            db.execute("UPDATE challenges SET pos_x = ?, pos_y = ? WHERE id = ?",
                       (x, y, item["id"]))

    spread(prologues, 60.0, CANVAS_W)
    spread(epilogues, CANVAS_H - 60.0, CANVAS_W)

    cols = max(1, round((len(others) ** 0.5)))
    for i, challenge in enumerate(others):
        col = i % cols
        row = i // cols
        rows_total = (len(others) + cols - 1) // cols
        x = CANVAS_W / (cols + 1) * (col + 1)
        y = 140.0 + (CANVAS_H - 280.0) / (rows_total + 1) * (row + 1)
        db.execute("UPDATE challenges SET pos_x = ?, pos_y = ? WHERE id = ?",
                   (x, y, challenge["id"]))

    for i, challenge in enumerate(challenges):
        # Линейная связь с предыдущим заданием (ненаправленная: храним как min_id, max_id)
        if i > 0:
            prev_id = challenges[i - 1]["id"]
            a_id = min(challenge["id"], prev_id)
            b_id = max(challenge["id"], prev_id)
            db.execute(
                "INSERT OR IGNORE INTO challenge_dependencies (child_id, parent_id) VALUES (?, ?)",
                (a_id, b_id)
            )

    db.commit()
    return jsonify({"message": "Auto-layout applied", "challenges_updated": len(challenges)})


# ─── Скрейпинг иконок ─────────────────────────────────────────────────────────

_wiki_session = requests.Session()
_wiki_session.headers.update({"User-Agent": "DBD-Tomes-Challenges/1.0 (icon scraper)"})


def _wiki_get(params: dict) -> dict:
    params.setdefault("format", "json")
    r = _wiki_session.get(WIKI_API, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def _get_tome_wiki_pages() -> list[dict]:
    data = _wiki_get({"action": "parse", "page": "The Archives", "prop": "links"})
    links = data.get("parse", {}).get("links", [])
    return [
        {"title": l["*"], "pageid": l.get("pageid", 0), "ns": l.get("ns", 0)}
        for l in links
        if re.match(r"(Event |Game Mode |Modifier )?Tome \d+ - ", l.get("*", ""))
    ]


def _parse_tome_wiki_page(title: str) -> dict[str, str]:
    data = _wiki_get({"action": "parse", "page": title, "prop": "text", "disablelimitreport": 1})
    if "parse" not in data:
        return {}
    html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(html, "html.parser")
    result: dict[str, str] = {}

    for table in soup.find_all("table", class_="wikitable"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue
            name_text = cells[0].get_text(strip=True)
            skip_names = ("challenge", "challenges", "", "regular challenges",
                          "nightmare challenges", "special challenges")
            if not name_text or name_text.lower() in skip_names:
                continue
            # Пропускаем строки, где первая ячейка занимает всю строку (colspan)
            first_colspan = int(cells[0].get("colspan", 1))
            if first_colspan > 2:
                continue
            normalized = re.sub(r"\s+", " ", name_text.strip().lower())
            for cell in cells[1:]:  # пропускаем ячейку с названием
                img = cell.find("img")
                if img:
                    src = img.get("data-src") or img.get("src", "")
                    if not src or "data:image" in src:
                        continue
                    src = re.sub(r"/scale-to-width-down/\d+", "", src)
                    if any(kw in src.lower() for kw in [
                        "challengeicon", "survivor", "killer", "iconhelpload",
                        "archivesgeneral", "iconhelp_archives",
                    ]):
                        result[normalized] = src
                        break

    time.sleep(SCRAPE_DELAY)
    return result


def _run_scrape_icons() -> tuple[int, int]:
    """Скачивает иконки заданий с вики. Возвращает (matched, downloaded)."""
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Добавить колонку icon_url если нет
    cols = [row[1] for row in conn.execute("PRAGMA table_info(challenges)").fetchall()]
    if "icon_url" not in cols:
        conn.execute("ALTER TABLE challenges ADD COLUMN icon_url TEXT")
        conn.commit()

    wiki_pages = _get_tome_wiki_pages()
    tomes = conn.execute("SELECT id, archive_key, name FROM tomes").fetchall()

    def find_wiki_page(archive_key: str, tome_name: str | None) -> str | None:
        # Стандартные тома: Tome01, Tome02, ...
        m = re.match(r"[Tt]ome(\d+)$", archive_key)
        if m:
            num = int(m.group(1))
            candidates = [p for p in wiki_pages if re.match(rf"^Tome {num} - ", p["title"])]
            if not candidates:
                return None
            if tome_name:
                subtitle_m = re.search(r" - (.+)$", tome_name)
                if subtitle_m:
                    subtitle = subtitle_m.group(1).strip().lower()
                    for page in candidates:
                        if subtitle in page["title"].lower():
                            return page["title"]
            return candidates[0]["title"]

        # Event/Game Mode/Modifier тома: матчинг по имени + год + версия
        if not tome_name:
            return None

        year_m = re.search(r"(\d{4})", archive_key)
        ver_m  = re.search(r"[Vv](\d+)$", archive_key)
        year    = year_m.group(1) if year_m else None
        version = int(ver_m.group(1)) if ver_m else None

        def _words(s: str) -> set[str]:
            stop = {"the", "a", "an", "of", "by", "in", "game", "event", "tome", "mode", "modifier"}
            return set(re.sub(r"[^a-z0-9]", " ", s.lower()).split()) - stop

        db_words = _words(tome_name)

        best_title: str | None = None
        best_score = -1
        for page in wiki_pages:
            wiki_words = _words(page["title"])
            score = len(db_words & wiki_words)
            # Бонусы применяем только при наличии хотя бы одного совпадения по словам
            if score >= 1 and year and year in page["title"]:
                score += 3
            if score >= 1 and version is not None:
                wiki_num_m = re.search(r"Tome (\d+) - ", page["title"])
                if wiki_num_m and int(wiki_num_m.group(1)) == version:
                    score += 2
            if score > best_score:
                best_score = score
                best_title = page["title"]

        return best_title if best_score >= 1 else None

    # Скачиваем иконку пролога/эпилога если ещё нет
    _prologue_icon_url = "https://static.wikia.nocookie.net/deadbydaylight_gamepedia_en/images/e/ec/IconHelp_archivesGeneral.png/revision/latest?cb=20191102073345"
    _prologue_icon_dest = ICONS_DIR / "IconHelp_archivesGeneral.png"
    if not _prologue_icon_dest.exists():
        try:
            _r = _wiki_session.get(_prologue_icon_url, timeout=15, stream=True)
            _r.raise_for_status()
            with open(_prologue_icon_dest, "wb") as _f:
                for _chunk in _r.iter_content(8192):
                    _f.write(_chunk)
        except Exception:
            pass

    # Считаем общее количество заданий для прогресса
    total_challenges = conn.execute("SELECT COUNT(*) FROM challenges").fetchone()[0]
    _scrape_state["total"]   = total_challenges
    _scrape_state["current"] = 0

    total_matched = 0
    total_downloaded = 0
    processed = 0

    for tome in tomes:
        archive_key = tome["archive_key"]
        wiki_title = find_wiki_page(archive_key, tome["name"])

        challenges = conn.execute("""
            SELECT c.id, c.challenge_key, c.name
            FROM challenges c
            JOIN pages p ON p.id = c.page_id
            WHERE p.tome_id = ?
        """, (tome["id"],)).fetchall()

        if not wiki_title:
            processed += len(challenges)
            _scrape_state["current"] = processed
            continue

        wiki_icons = _parse_tome_wiki_page(wiki_title)

        for ch in challenges:
            processed += 1
            _scrape_state["current"] = processed

            if not ch["name"]:
                continue
            normalized = re.sub(r"\s+", " ", ch["name"].strip().lower())

            # Пролог и эпилог не присутствуют в вики-таблицах — задаём иконку напрямую
            if normalized in ("prologue", "epilogue"):
                rel_path = "/challenge_icons/IconHelp_archivesGeneral.png"
                conn.execute("UPDATE challenges SET icon_url = ? WHERE id = ?", (rel_path, ch["id"]))
                total_matched += 1
                continue

            icon_url = wiki_icons.get(normalized)
            if not icon_url:
                for wname, wurl in wiki_icons.items():
                    if normalized in wname or wname in normalized:
                        icon_url = wurl
                        break
            if not icon_url:
                continue

            url_path = unquote(urlparse(icon_url).path)
            fname_match = re.search(r'/([^/]+\.(png|jpg|webp|gif))(?:/|$)', url_path, re.IGNORECASE)
            if not fname_match:
                continue
            original_fname = fname_match.group(1)
            dest = ICONS_DIR / original_fname

            if not dest.exists():
                try:
                    r = _wiki_session.get(icon_url, timeout=15, stream=True)
                    r.raise_for_status()
                    with open(dest, "wb") as f:
                        for chunk in r.iter_content(8192):
                            f.write(chunk)
                    time.sleep(0.2)
                    total_downloaded += 1
                except Exception:
                    continue

            rel_path = f"/challenge_icons/{original_fname}"
            conn.execute("UPDATE challenges SET icon_url = ? WHERE id = ?", (rel_path, ch["id"]))
            total_matched += 1

        conn.commit()

    conn.close()
    return total_matched, total_downloaded


_scrape_state: dict = {
    "running":        False,
    "total":          0,
    "current":        0,
    "last_run":       None,
    "last_matched":   0,
    "last_downloaded": 0,
}


def _load_scrape_state() -> None:
    if _SCRAPE_STATE_FILE.exists():
        try:
            data = json.loads(_SCRAPE_STATE_FILE.read_text(encoding="utf-8"))
            for k in ("last_run", "last_matched", "last_downloaded"):
                if k in data:
                    _scrape_state[k] = data[k]
        except Exception:
            pass


_load_scrape_state()


@app.post("/api/admin/scrape-icons")
@admin_required
def scrape_icons_endpoint():
    """
    Запустить скрипт скачивания иконок в фоновом потоке. Только для админов.
    Ответ 200: { message }
    Ответ 409: если скрипт уже запущен
    """
    if _scrape_state["running"]:
        return jsonify({"error": "Scraping already in progress"}), 409

    def run():
        _scrape_state["running"] = True
        try:
            matched, downloaded = _run_scrape_icons()
            _scrape_state["last_matched"]    = matched
            _scrape_state["last_downloaded"] = downloaded
            _scrape_state["last_run"]        = datetime.now(timezone.utc).isoformat()
            _SCRAPE_STATE_FILE.write_text(json.dumps({
                "last_run":        _scrape_state["last_run"],
                "last_matched":    _scrape_state["last_matched"],
                "last_downloaded": _scrape_state["last_downloaded"],
            }, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            app.logger.error(f"scrape-icons error: {e}")
        finally:
            _scrape_state["running"] = False

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"message": "Icon scraping started in background"})


@app.get("/api/admin/scrape-icons/status")
@admin_required
def scrape_icons_status():
    """
    Статус фонового скрейпинга иконок. Только для админов.
    Ответ 200: { running: bool }
    """
    return jsonify({
        "running":        _scrape_state["running"],
        "total":          _scrape_state["total"],
        "current":        _scrape_state["current"],
        "last_run":       _scrape_state["last_run"],
        "last_matched":   _scrape_state["last_matched"],
        "last_downloaded": _scrape_state["last_downloaded"],
    })


# ─── Статус выполнения ────────────────────────────────────────────────────────

def is_prologue(name: str | None) -> bool:
    return name is not None and name.lower() in ("prologue", "пролог")


def is_epilogue(name: str | None) -> bool:
    return name is not None and name.lower() in ("epilogue", "эпилог")


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

    # Связи (ненаправленный граф: ищем в обоих направлениях)
    id_list = list(challenge_ids)
    placeholders = ",".join("?" * len(id_list))
    deps = db.execute(f"""
        SELECT child_id, parent_id
        FROM challenge_dependencies
        WHERE child_id IN ({placeholders}) OR parent_id IN ({placeholders})
    """, id_list + id_list).fetchall()

    # Построить ненаправленный граф смежности
    adjacency: dict[int, set[int]] = {}
    for d in deps:
        adjacency.setdefault(d["child_id"], set()).add(d["parent_id"])
        adjacency.setdefault(d["parent_id"], set()).add(d["child_id"])

    # BFS от прологов к эпилогам по ненаправленному графу выполненных узлов
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

            for neighbor_id in adjacency.get(current, []):
                if neighbor_id not in visited and neighbor_id in completed_ids:
                    visited.add(neighbor_id)
                    queue.append(neighbor_id)

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