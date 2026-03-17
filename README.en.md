# DBD Tomes Challenges

A progress tracker for Archive Tomes challenges in Dead by Daylight.

> 🇷🇺 [Russian version](README.md)

---

## Table of Contents

- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
  - [Development (without Docker)](#development-without-docker)
  - [Production (Docker Compose)](#production-docker-compose)
  - [Environment Variables](#environment-variables)
  - [First Launch: Creating an Admin](#first-launch-creating-an-admin)
  - [Populating the Catalog](#populating-the-catalog)
- [Database Schema](#database-schema)
- [API](#api)

---

## Key Features

### Keyword Search with Filters

Global search across all tomes lets you find challenges by keywords in the name or description — e.g. "totem", "chest", "hook", "generator". This is useful when you want to pick a challenge that fits your current build or mood without manually browsing dozens of pages.

Search works together with filters:
- **By role** — Survivor, Killer, or any role
- **By status** — all / available only / completed only

Available challenges are those you can complete right now, based on your current progress and challenge dependencies.

### Progress Tracking

Each challenge can be marked as completed. Progress is stored server-side and accessible from any device. The dependency system shows which challenges are unlocked and which are still locked:

- 🟢 **Completed**
- 🔵 **Available** — the preceding challenge in the chain is done
- 🔒 **Locked** — a neighboring challenge must be completed first

### Two-Language Support

The interface and challenge content are available in **English** and **Russian**. Language can be toggled via the button in the bottom-right corner.

### Open API

The first public API that returns not only basic challenge data (name, description, role, rewards), but also:
- **dependency graph** — which challenges are connected to each other
- **visual positions** of nodes relative to each other

This allows you to build your own clients, visualizations, and tools on top of DBD tome data. No authentication required to read the catalog.

---

## Installation & Setup

### Development (without Docker)

**Requirements:** Python 3.10+, Node.js 20+, Yarn

```bash
git clone https://github.com/vasartam/dbd-tomes-challenges
cd dbd-tomes-challenges

# Backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env as needed
python app.py

# Frontend (in a separate terminal)
cd frontend
yarn install
yarn dev
```

Backend runs at `http://localhost:5001`, frontend at `http://localhost:3000`.

### Production (Docker Compose)

```bash
cp .env.example .env
# Fill in .env: JWT_SECRET_KEY and other variables

docker compose pull
docker compose up -d
```

Nginx proxies requests to the frontend (port 3001) and backend (port 5001).

### Environment Variables

File `.env` (created from `.env.example`):

| Variable         | Description                                                                                       |
|------------------|---------------------------------------------------------------------------------------------------|
| `APP_ENV`        | `development` or `production`                                                                     |
| `JWT_SECRET_KEY` | Secret for signing JWT tokens. Generate with: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DB_PATH`        | Path to the SQLite file (e.g. `./db.sqlite`)                                                      |
| `PORT`           | Backend port (default `5001`)                                                                     |

### First Launch: Creating an Admin

After the first launch, register an account through the app interface, then grant it admin rights via CLI:

```bash
# Without Docker
python app.py --make-admin <username>

# With Docker
docker compose exec backend python app.py --make-admin <username>
```

After this, an **Admin** section will appear in the navigation.

### Populating the Catalog

Once you have admin access, go to the **Admin** section:

1. **Sync catalog** — click "Run Sync". The app will load all tomes, pages, and challenges from the public API at [dbd.tricky.lol](https://dbd.tricky.lol). No game login required. Safe to run repeatedly — data updates without duplication.

2. **Download icons** — click "Download Icons". The app will find challenge icons on the DBD wiki and save them locally. The process runs in the background with progress shown in the UI.

3. **Dependency graph editor** — each tome page has a link to an editor where you can drag challenge nodes to set their visual positions and configure dependencies between challenges (click a node → select neighbors). Dependencies are stored as an undirected graph — a link between challenges works in both directions.

---

## Database Schema

SQLite file is created automatically on first run at the path set in `DB_PATH`.

### `users`
| Column          | Type    | Description                         |
|-----------------|---------|-------------------------------------|
| `id`            | INTEGER | Primary key                         |
| `username`      | TEXT    | Unique username                     |
| `password_hash` | TEXT    | Password hash (werkzeug/scrypt)     |
| `is_admin`      | INTEGER | `1` = administrator                 |
| `created_at`    | TEXT    | Registration date (UTC)             |

### `tomes`
| Column        | Type    | Description                                     |
|---------------|---------|-------------------------------------------------|
| `id`          | INTEGER | Primary key                                     |
| `archive_key` | TEXT    | API key (`Tome01`, `Anniversary2022`, ...)      |
| `name`        | TEXT    | Tome name                                       |
| `start_ts`    | INTEGER | Event start Unix timestamp                      |
| `end_ts`      | INTEGER | Event end Unix timestamp                        |

### `pages`
| Column         | Type    | Description                    |
|----------------|---------|--------------------------------|
| `id`           | INTEGER | Primary key                    |
| `tome_id`      | INTEGER | Foreign key → `tomes.id`       |
| `level_number` | INTEGER | Page number within the tome    |

### `challenges`
| Column          | Type    | Description                                          |
|-----------------|---------|------------------------------------------------------|
| `id`            | INTEGER | Primary key                                          |
| `page_id`       | INTEGER | Foreign key → `pages.id`                             |
| `challenge_key` | TEXT    | Unique key: `{archive_key}_L{level}_N{index}`        |
| `node_index`    | INTEGER | Order index on the page                              |
| `name`          | TEXT    | Name (EN)                                            |
| `name_ru`       | TEXT    | Name (RU)                                            |
| `role`          | TEXT    | `survivor` / `killer` / `shared`                     |
| `objective`     | TEXT    | Challenge description (may contain HTML)             |
| `objective_ru`  | TEXT    | Description in Russian                               |
| `rewards`       | TEXT    | JSON: `[{"type":"...","id":"...","amount":N}]`       |
| `pos_x`         | REAL    | X coordinate on the graph                            |
| `pos_y`         | REAL    | Y coordinate on the graph                            |
| `icon_url`      | TEXT    | Path to the challenge icon                           |

### `challenge_dependencies`
| Column     | Type    | Description                                           |
|------------|---------|-------------------------------------------------------|
| `id`       | INTEGER | Primary key                                           |
| `child_id` | INTEGER | Challenge ID (smaller of the pair; undirected graph)  |
| `parent_id`| INTEGER | Challenge ID (larger of the pair)                     |

### `user_challenge_progress`
| Column         | Type    | Description                         |
|----------------|---------|-------------------------------------|
| `id`           | INTEGER | Primary key                         |
| `user_id`      | INTEGER | Foreign key → `users.id`            |
| `challenge_id` | INTEGER | Foreign key → `challenges.id`       |
| `completed`    | INTEGER | `1` = completed, `0` = not          |
| `updated_at`   | TEXT    | Last updated (UTC)                  |

---

## API

All endpoints return JSON. Protected endpoints (🔒) require the header:
```
Authorization: Bearer <access_token>
```

Add `lang=ru` to get Russian names and descriptions.

### Auth

#### `POST /api/auth/register`

Request:
```json
{ "username": "my_user", "password": "secret123" }
```
Response `201`:
```json
{ "message": "Registered successfully" }
```

#### `POST /api/auth/login`

Request:
```json
{ "username": "my_user", "password": "secret123" }
```
Response `200`:
```json
{ "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "username": "my_user" }
```

Token is valid for **7 days**.

### Profile

#### `GET /api/user/profile` 🔒

Response `200`:
```json
{ "id": 1, "username": "my_user", "is_admin": false, "created_at": "2025-01-01 12:00:00" }
```

### Catalog

#### `GET /api/tomes`

Response `200`:
```json
[
  { "id": 1, "archive_key": "Tome01", "name": "Tome I - Awakening", "start_ts": 1573171200, "end_ts": null },
  { "id": 2, "archive_key": "Tome02", "name": "Tome II - Reckoning", "start_ts": 1578441600, "end_ts": null }
]
```

#### `GET /api/tomes/<archive_key>`

Tome with its pages. Example: `GET /api/tomes/Tome01`

Response `200`:
```json
{
  "id": 1,
  "archive_key": "Tome01",
  "name": "Tome I - Awakening",
  "start_ts": 1573171200,
  "end_ts": null,
  "pages": [
    { "id": 1, "level_number": 1 },
    { "id": 2, "level_number": 2 }
  ]
}
```

#### `GET /api/pages/<page_id>`

Page with its challenges. Example: `GET /api/pages/1`

Response `200`:
```json
{
  "id": 1,
  "tome_id": 1,
  "level_number": 1,
  "challenges": [
    {
      "id": 1,
      "challenge_key": "Tome01_L1_N0",
      "node_index": 0,
      "name": "Prologue",
      "name_ru": "Пролог",
      "role": "shared",
      "objective": "...",
      "objective_ru": "...",
      "rewards": [{"type": "bloodpoints", "id": "bloodpoints", "amount": 0}],
      "pos_x": 100.0,
      "pos_y": 300.0,
      "icon_url": null
    }
  ]
}
```

#### `GET /api/challenges`

Challenge list with filtering.

| Parameter | Description                              |
|-----------|------------------------------------------|
| `q`       | Search by name and description           |
| `role`    | `survivor` / `killer` / `shared`         |
| `tome`    | Filter by `archive_key`                  |
| `page_id` | Filter by page ID                        |
| `lang`    | `en` / `ru`                              |

Example: `GET /api/challenges?q=totem&role=killer&lang=en`

Response `200`:
```json
[
  {
    "id": 5,
    "challenge_key": "Tome01_L1_N4",
    "node_index": 4,
    "name": "Hex: Ruin",
    "name_ru": "Проклятие: Разруха",
    "role": "killer",
    "objective": "Cleanse or bless 4 totems in a single match.",
    "objective_ru": "Очистите или освятите 4 тотема за одну игру.",
    "rewards": [{"type": "bloodpoints", "id": "bloodpoints", "amount": 5000}],
    "icon_url": "/icons/Tome01_L1_N4.png"
  }
]
```

#### `GET /api/challenges/<challenge_key>`

Single challenge. Example: `GET /api/challenges/Tome01_L1_N0`

Response `200`:
```json
{
  "id": 1,
  "challenge_key": "Tome01_L1_N0",
  "node_index": 0,
  "name": "Prologue",
  "name_ru": "Пролог",
  "role": "shared",
  "objective": "...",
  "objective_ru": "...",
  "rewards": [],
  "pos_x": 100.0,
  "pos_y": 300.0,
  "icon_url": null
}
```

### Dependency Graph

#### `GET /api/pages/<page_id>/dependencies`

Dependency graph for a page: node positions and edges.

Response `200`:
```json
{
  "level_number": 1,
  "is_first_page": true,
  "prev_page_id": null,
  "challenges": [
    { "id": 1, "challenge_key": "Tome01_L1_N0", "name": "Prologue", "role": "shared", "pos_x": 100.0, "pos_y": 300.0, "icon_url": null },
    { "id": 2, "challenge_key": "Tome01_L1_N1", "name": "Hex: Ruin", "role": "killer", "pos_x": 300.0, "pos_y": 200.0, "icon_url": "/icons/Tome01_L1_N1.png" }
  ],
  "dependencies": [
    { "a_id": 1, "b_id": 2 }
  ]
}
```

#### `GET /api/dependencies?page_ids=1,2,3`

Dependency graphs for multiple pages in a single request.

Response `200`:
```json
{
  "1": {
    "level_number": 1,
    "is_first_page": true,
    "prev_page_id": null,
    "challenges": [...],
    "dependencies": [...]
  },
  "2": {
    "level_number": 2,
    "is_first_page": false,
    "prev_page_id": 1,
    "challenges": [...],
    "dependencies": [...]
  }
}
```

### Progress 🔒

#### `GET /api/user/progress`

Response `200`:
```json
[
  { "challenge_key": "Tome01_L1_N1", "completed": true, "updated_at": "2025-03-01 10:00:00" },
  { "challenge_key": "Tome01_L1_N2", "completed": false, "updated_at": "2025-03-01 10:05:00" }
]
```

#### `PUT /api/user/progress/<challenge_key>`

Request:
```json
{ "completed": true }
```
Response `200`:
```json
{ "challenge_key": "Tome01_L1_N1", "completed": true }
```

Prologue and epilogue are auto-completed — manual updates return `400`.

#### `GET /api/user/pages/<page_id>/completion`

Response `200`:
```json
{ "page_id": 1, "is_complete": true }
```

#### `GET /api/user/tomes/<archive_key>/completion`

Response `200`:
```json
{
  "archive_key": "Tome01",
  "pages": [
    { "page_id": 1, "level_number": 1, "is_complete": true },
    { "page_id": 2, "level_number": 2, "is_complete": false }
  ]
}
```

### Admin 🔒 (admin only)

#### `POST /api/admin/sync-catalog`

Sync catalog from [dbd.tricky.lol](https://dbd.tricky.lol). Safe to call repeatedly.

Response `200`:
```json
{ "message": "Synced", "tomes": 20, "pages": 80, "challenges": 640 }
```

#### `POST /api/admin/scrape-icons`

Start icon scraping in the background.

Response `200`:
```json
{ "message": "Icon scraping started" }
```

#### `GET /api/admin/scrape-icons/status`

Response `200`:
```json
{
  "running": true,
  "total": 640,
  "current": 312,
  "last_run": "2025-03-01 12:00:00",
  "last_matched": 638,
  "last_downloaded": 45
}
```

#### `GET /api/admin/users`

Response `200`:
```json
[
  { "id": 1, "username": "admin", "is_admin": true, "created_at": "2025-01-01 12:00:00" },
  { "id": 2, "username": "user1", "is_admin": false, "created_at": "2025-02-01 09:00:00" }
]
```

#### `POST /api/admin/users/<id>/toggle-admin`

Grant or revoke admin rights.

Response `200`:
```json
{ "id": 2, "username": "user1", "is_admin": true }
```

#### `PUT /api/admin/challenges/<challenge_key>/position`

Request:
```json
{ "pos_x": 100.0, "pos_y": 200.0 }
```
Response `200`:
```json
{ "challenge_key": "Tome01_L1_N1", "pos_x": 100.0, "pos_y": 200.0 }
```

#### `POST /api/admin/challenges/<challenge_key>/dependencies`

Request:
```json
{ "neighbor_keys": ["Tome01_L1_N0", "Tome01_L1_N2"] }
```
Response `200`:
```json
{ "challenge_key": "Tome01_L1_N1", "neighbor_keys": ["Tome01_L1_N0", "Tome01_L1_N2"] }
```
