# DBD Tomes Challenges

Бэкенд-приложение для отслеживания прогресса по заданиям архивов (Tomes) из игры Dead by Daylight.

- Хранит полный каталог томов, страниц и заданий в локальной базе данных SQLite.
- Предоставляет REST API для управления аккаунтами и прогрессом.
- Каталог заданий синхронизируется с публичным API [dbd.tricky.lol](https://dbd.tricky.lol) — авторизация в игре не требуется.

---

## Требования

- Python 3.10+

---

## Установка и запуск

```bash
pip install -r requirements.txt

# Скопируйте файл с переменными окружения и заполните его
cp .env.example .env
```

### Development

```bash
python app.py
```

Flask запустится в режиме отладки с авто-перезагрузкой. Не использовать в продакшене.

### Production

Установите `APP_ENV=production` в `.env`, задайте надёжный `JWT_SECRET_KEY` и запустите:

```bash
python app.py
```

В production-режиме приложение запускается через **Waitress** — многопоточный WSGI-сервер, работающий на Windows и Linux. Режим отладки отключён.

### Переменные окружения (файл `.env`)

| Переменная      | Значения                        | Описание                                          |
|-----------------|---------------------------------|---------------------------------------------------|
| `APP_ENV`       | `development` / `production`    | Режим запуска                                     |
| `JWT_SECRET_KEY`| произвольная строка             | Секрет для подписи JWT-токенов                    |
| `DB_PATH`       | путь к файлу                    | Путь к файлу базы данных SQLite                   |
| `PORT`          | число                           | Порт сервера                                      |

---

## База данных

Файл `db.sqlite` создаётся автоматически при первом запуске.

### Схема таблиц

#### `users` — пользователи
| Поле            | Тип     | Описание                        |
|-----------------|---------|---------------------------------|
| `id`            | INTEGER | Первичный ключ                  |
| `username`      | TEXT    | Никнейм (уникальный)            |
| `password_hash` | TEXT    | Хэш пароля (werkzeug/scrypt)    |
| `created_at`    | TEXT    | Дата регистрации (UTC)          |

#### `tomes` — тома / архивные события
| Поле          | Тип     | Описание                                        |
|---------------|---------|-------------------------------------------------|
| `id`          | INTEGER | Первичный ключ                                  |
| `archive_key` | TEXT    | Ключ из API (`Tome01`, `Anniversary2022`, ...)  |
| `name`        | TEXT    | Название тома                                   |
| `start_ts`    | INTEGER | Unix-timestamp начала события                   |
| `end_ts`      | INTEGER | Unix-timestamp конца события                    |

#### `pages` — страницы тома
| Поле           | Тип     | Описание                         |
|----------------|---------|----------------------------------|
| `id`           | INTEGER | Первичный ключ                   |
| `tome_id`      | INTEGER | Внешний ключ → `tomes.id`        |
| `level_number` | INTEGER | Номер страницы внутри тома       |

#### `challenges` — задания
| Поле            | Тип     | Описание                                             |
|-----------------|---------|------------------------------------------------------|
| `id`            | INTEGER | Первичный ключ                                       |
| `page_id`       | INTEGER | Внешний ключ → `pages.id`                            |
| `challenge_key` | TEXT    | Составной ключ: `{archive_key}_L{level}_N{index}`   |
| `node_index`    | INTEGER | Порядковый номер на странице                         |
| `name`          | TEXT    | Название задания                                     |
| `role`          | TEXT    | `survivor` / `killer` / `shared`                     |
| `objective`     | TEXT    | Описание задания (может содержать HTML)              |
| `rewards`       | TEXT    | JSON: `[{"type": "...", "id": "...", "amount": N}]`  |

#### `user_challenge_progress` — прогресс пользователей
| Поле           | Тип     | Описание                           |
|----------------|---------|------------------------------------|
| `id`           | INTEGER | Первичный ключ                     |
| `user_id`      | INTEGER | Внешний ключ → `users.id`          |
| `challenge_id` | INTEGER | Внешний ключ → `challenges.id`     |
| `completed`    | INTEGER | `1` = выполнено, `0` = не выполнено|
| `updated_at`   | TEXT    | Дата последнего изменения (UTC)    |

---

## API

Все эндпоинты возвращают JSON. Защищённые эндпоинты (отмечены 🔒) требуют заголовок:
```
Authorization: Bearer <access_token>
```

### Авторизация

#### `POST /api/auth/register` — регистрация

Правила для никнейма: латинские буквы, цифры и `_`; символ `_` не может быть первым или последним.

**Тело запроса:**
```json
{
  "username": "my_username",
  "password": "secret123"
}
```

**Ответ `201`:**
```json
{ "message": "Registered successfully" }
```

**Ошибки:** `400` (невалидный никнейм / пароль < 6 символов), `409` (никнейм занят).

---

#### `POST /api/auth/login` — вход

**Тело запроса:**
```json
{
  "username": "my_username",
  "password": "secret123"
}
```

**Ответ `200`:**
```json
{
  "access_token": "eyJ...",
  "username": "my_username"
}
```

Токен действителен **7 дней**. Передавайте его в заголовке `Authorization: Bearer <access_token>` для всех защищённых запросов.

**Ошибки:** `401` (неверные учётные данные).

---

### Профиль

#### `GET /api/user/profile` 🔒 — профиль текущего пользователя

**Ответ `200`:**
```json
{
  "id": 1,
  "username": "my_username",
  "created_at": "2025-01-01 12:00:00"
}
```

---

### Каталог заданий

#### `GET /api/tomes` — список всех томов

**Ответ `200`:**
```json
[
  {
    "id": 1,
    "archive_key": "Tome01",
    "name": "ECHOES",
    "start_ts": 1571270400,
    "end_ts": null
  },
  ...
]
```

---

#### `GET /api/tomes/<archive_key>` — том со страницами

Пример: `GET /api/tomes/Tome01`

**Ответ `200`:**
```json
{
  "id": 1,
  "archive_key": "Tome01",
  "name": "ECHOES",
  "start_ts": 1571270400,
  "end_ts": null,
  "pages": [
    { "id": 1, "tome_id": 1, "level_number": 1 },
    { "id": 2, "tome_id": 1, "level_number": 2 }
  ]
}
```

**Ошибки:** `404` (том не найден).

---

#### `GET /api/pages/<page_id>` — страница с заданиями

Пример: `GET /api/pages/1`

**Ответ `200`:**
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
      "name": "Escape the Nightmare",
      "role": "survivor",
      "objective": "Escape <b>2</b> times.",
      "rewards": [
        { "type": "currency", "id": "bloodpoints", "amount": 15000 }
      ]
    },
    ...
  ]
}
```

---

#### `GET /api/challenges` — список заданий с фильтрацией

**Query-параметры:**

| Параметр  | Описание                                  |
|-----------|-------------------------------------------|
| `tome`    | Фильтр по `archive_key` тома              |
| `page_id` | Фильтр по `id` страницы                   |
| `role`    | `survivor` / `killer` / `shared`          |
| `q`       | Поиск по названию и описанию задания      |

Примеры:
```
GET /api/challenges?tome=Tome01
GET /api/challenges?role=killer
GET /api/challenges?q=totem
GET /api/challenges?tome=Tome01&role=survivor&q=hook
```

**Ответ `200`:** массив заданий (те же поля, что и в `/api/pages/<id>`, плюс `level_number`, `archive_key`, `tome_name`).

---

#### `GET /api/challenges/<challenge_key>` — одно задание

Пример: `GET /api/challenges/Tome01_L1_N0`

**Ответ `200`:** объект задания с полями тома и страницы.

**Ошибки:** `404`.

---

### Прогресс пользователя

#### `GET /api/user/progress` 🔒 — прогресс по всем заданиям

Возвращает только задания, для которых уже есть запись.

**Ответ `200`:**
```json
[
  {
    "challenge_key": "Tome01_L1_N0",
    "challenge_name": "Escape the Nightmare",
    "role": "survivor",
    "completed": 1,
    "updated_at": "2025-01-15 10:30:00",
    "level_number": 1,
    "archive_key": "Tome01",
    "tome_name": "ECHOES"
  },
  ...
]
```

---

#### `PUT /api/user/progress/<challenge_key>` 🔒 — отметить задание

Пример: `PUT /api/user/progress/Tome01_L1_N0`

**Тело запроса:**
```json
{ "completed": true }
```

Чтобы снять отметку:
```json
{ "completed": false }
```

**Ответ `200`:**
```json
{ "challenge_key": "Tome01_L1_N0", "completed": true }
```

**Ошибки:** `404` (задание не найдено).

---

### Синхронизация каталога

#### `POST /api/admin/sync-catalog` — загрузить каталог с dbd.tricky.lol

Загружает актуальный список всех томов, страниц и заданий из открытого API и сохраняет в локальную БД. Авторизация не нужна. Безопасно вызывать повторно — данные обновятся без дублирования.

```bash
curl -X POST http://localhost:5000/api/admin/sync-catalog
```

**Ответ `200`:**
```json
{
  "message": "Catalog synced successfully",
  "tomes": 18,
  "pages": 72,
  "challenges": 864
}
```

**Ошибки:** `502` (не удалось получить данные от источника).

---

## Быстрый старт

```bash
# 1. Установить зависимости
pip install -r requirements.txt

# 2. Запустить сервер (база данных создаётся автоматически)
python app.py

# 3. Загрузить каталог заданий
curl -X POST http://localhost:5000/api/admin/sync-catalog

# 4. Зарегистрироваться
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "my_user", "password": "secret123"}'

# 5. Войти и получить токен
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "my_user", "password": "secret123"}'

# 6. Отметить задание как выполненное (подставьте свой токен)
curl -X PUT http://localhost:5000/api/user/progress/Tome01_L1_N0 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'

# 7. Посмотреть свой прогресс
curl http://localhost:5000/api/user/progress \
  -H "Authorization: Bearer <access_token>"
```