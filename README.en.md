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
- [Dependency Graph Editor](#dependency-graph-editor)
- [Deployment via GitHub Actions](#deployment-via-github-actions)
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

The **Prologue** of each page is automatically considered completed as soon as the page becomes accessible — no need to click it manually. The **Epilogue** is also auto-completed once the last challenge before it is marked done. This means challenges on the first page of any tome immediately show as available in global search.

### Visual Dependency Graph

Each tome page is displayed as an interactive canvas graph: challenges are positioned at their visual coordinates, edges show dependencies between them. The graph supports panning and zooming, challenge icons load automatically.

### Two-Language Support

The interface and challenge content are available in **English** and **Russian**. Language can be toggled in the app header.

### Page and Tome Completion Status

Page tabs show a completion checkmark. A page is considered complete when a full path from the prologue to the epilogue is traversed.

### Open API

The first public API that returns not only basic challenge data (name, description, role, rewards), but also:
- **dependency graph** — which challenges are connected to each other
- **visual positions** of nodes relative to each other on the canvas

This allows you to build your own clients, visualizations, and tools on top of DBD tome data. No authentication required to read the catalog.

---

## Installation & Setup

### Development (without Docker)

**Requirements:** Python 3.10+, Node.js 18+, Yarn

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

| Variable         | Description                                          |
|------------------|------------------------------------------------------|
| `APP_ENV`        | `development` or `production`                        |
| `JWT_SECRET_KEY` | Secret for signing JWT tokens (use a long string)    |
| `DB_PATH`        | Path to the SQLite file (e.g. `./db.sqlite`)         |
| `PORT`           | Backend port (default `5001`)                        |

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

After this, the catalog is fully ready to use.

---

## Dependency Graph Editor

For developers and contributors: the **Admin** section contains a link to the dependency graph editor for each tome page.

In the editor you can:
- Drag challenge nodes to set their visual positions on the canvas
- Set dependencies between challenges (click a node → select neighbors)
- Apply **auto-layout** to arrange nodes linearly

Dependencies are stored as an undirected graph — a link between challenges works in both directions.

---

## Deployment via GitHub Actions

The repository includes a ready-to-use workflow (`.github/workflows/deploy.yml`):

1. On push to `master`, Docker images for the backend and frontend are built and published to GitHub Container Registry (GHCR)
2. An SSH command is sent to the server: `docker compose pull && docker compose up -d`

Required repository secrets:

| Secret           | Description                    |
|------------------|--------------------------------|
| `DEPLOY_HOST`    | Server IP or domain            |
| `DEPLOY_USER`    | SSH user                       |
| `DEPLOY_SSH_KEY` | Private SSH key                |

The server must have Docker and Docker Compose installed, along with `GHCR_TOKEN` and `GHCR_USER` environment variables for GHCR authentication.

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
```json
{ "username": "my_user", "password": "secret123" }
```
Response `201`: `{ "message": "Registered successfully" }`

#### `POST /api/auth/login`
```json
{ "username": "my_user", "password": "secret123" }
```
Response `200`: `{ "access_token": "eyJ...", "username": "my_user" }`

Token is valid for **7 days**.

### Profile

#### `GET /api/user/profile` 🔒
```json
{ "id": 1, "username": "my_user", "is_admin": false, "created_at": "2025-01-01 12:00:00" }
```

### Catalog

#### `GET /api/tomes`
List of all tomes.

#### `GET /api/tomes/<archive_key>`
Tome with its pages. Example: `GET /api/tomes/Tome01`

#### `GET /api/pages/<page_id>`
Page with its challenges. Example: `GET /api/pages/1`

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

#### `GET /api/challenges/<challenge_key>`
Single challenge. Example: `GET /api/challenges/Tome01_L1_N0`

### Dependency Graph

#### `GET /api/pages/<page_id>/dependencies`
Dependency graph for a page: node positions and edges.

```json
{
  "challenges": [
    { "id": 1, "challenge_key": "Tome01_L1_N0", "name": "...", "pos_x": 100.0, "pos_y": 200.0, ... }
  ],
  "dependencies": [
    { "a_id": 1, "b_id": 2 }
  ],
  "level_number": 1,
  "is_first_page": true,
  "prev_page_id": null
}
```

#### `GET /api/dependencies?page_ids=1,2,3`
Dependency graphs for multiple pages in a single request.

### Progress 🔒

#### `GET /api/user/progress`
All progress for the current user.

#### `PUT /api/user/progress/<challenge_key>`
```json
{ "completed": true }
```
Prologue and epilogue are auto-completed — manual updates return `400`.

#### `GET /api/user/pages/<page_id>/completion`
Page completion status: `{ "is_complete": true, ... }`

#### `GET /api/user/tomes/<archive_key>/completion`
Tome completion status for each page.

### Admin 🔒 (admin only)

#### `POST /api/admin/sync-catalog`
Sync catalog from [dbd.tricky.lol](https://dbd.tricky.lol). Safe to call repeatedly.

#### `POST /api/admin/scrape-icons`
Start icon scraping in the background.

#### `GET /api/admin/scrape-icons/status`
Icon scraping progress.

#### `GET /api/admin/users`
List all users.

#### `POST /api/admin/users/<id>/toggle-admin`
Grant or revoke admin rights.

#### `PUT /api/admin/challenges/<challenge_key>/position`
Set node position on the graph: `{ "pos_x": 100.0, "pos_y": 200.0 }`

#### `POST /api/admin/challenges/<challenge_key>/dependencies`
Set dependency list: `{ "neighbor_keys": ["Tome01_L1_N1", "Tome01_L1_N2"] }`

#### `POST /api/admin/pages/<page_id>/auto-layout`
Auto-arrange page nodes in a linear layout.
