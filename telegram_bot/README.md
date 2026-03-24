# Telegram Self-Tracking Bot

A personal Telegram bot for structured self-tracking. Define check-in sessions with custom questions, receive scheduled prompts, and export your data for analysis.

---

## Features

- **Flexible sessions** — daily or weekly, any time (UTC)
- **5 question types** — scale, boolean, text, numeric, multi-choice
- **Inline keyboards** — tap to answer; no typing for scales, booleans, or choices
- **Reminders** — automatic follow-up if you don't respond within N minutes
- **Data export** — CSV or JSON download via `/export`
- **Stats** — per-session run counts and averages for numeric/scale questions
- **Auth guard** — whitelist specific Telegram user IDs

---

## Quick Start

### 1. Create a bot

Message [@BotFather](https://t.me/botfather) → `/newbot` → copy the token.

### 2. Configure

```bash
cd telegram_bot
cp .env.example .env
# Edit .env: set TELEGRAM_BOT_TOKEN and AUTHORIZED_USERS
```

### 3a. Run with Docker (recommended)

```bash
docker compose up -d
docker compose logs -f
```

### 3b. Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Set env vars or use a .env loader
export TELEGRAM_BOT_TOKEN=...
export AUTHORIZED_USERS=...
python -m bot.main
```

---

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Register and show help |
| `/create_session` | Interactive session wizard |
| `/add_question` | Add a question to a session |
| `/list_sessions` | Show all active sessions |
| `/delete_session <id>` | Remove a session |
| `/export [csv\|json]` | Download your data |
| `/stats` | Summary stats with averages |
| `/history` | Last 10 completed check-ins |
| `/set_timezone <tz>` | Set display timezone (e.g. `Europe/Berlin`) |
| `/cancel` | Cancel any setup flow |

---

## Walkthrough: Evening Check-in

```
/create_session
  → Name: Evening
  → Time: 21:00  (UTC)
  → Frequency: Daily

/add_question
  → Session: Evening
  → Text: How was your mood today?
  → Type: Scale  →  min 1  max 5

/add_question
  → Session: Evening
  → Text: Were you productive?
  → Type: Boolean

/add_question
  → Session: Evening
  → Text: Any notes?
  → Type: Text
```

At 21:00 UTC the bot sends:

```
⏰ Time for Evening!

Q: How was your mood today?
(Scale: 1–5)
[1] [2] [3] [4] [5]
```

After answering all questions: `✅ Evening complete!`

---

## Architecture

```
telegram_bot/
├── bot/
│   ├── config.py          – env-var config
│   ├── main.py            – Application setup & handler registration
│   ├── database/
│   │   ├── models.py      – SQLAlchemy models
│   │   └── db.py          – engine init & session context manager
│   ├── handlers/
│   │   ├── commands.py    – one-shot commands
│   │   ├── create_session.py – ConversationHandler FSM
│   │   ├── add_question.py   – ConversationHandler FSM
│   │   └── answering.py   – inline + text answer handling
│   ├── scheduler/
│   │   └── scheduler.py   – APScheduler jobs & question delivery
│   └── utils/
│       ├── keyboards.py   – InlineKeyboard builders
│       └── export.py      – CSV / JSON export
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

### Key design decisions

| Decision | Rationale |
|---|---|
| DB-backed run state (`SessionRun`) | Survives restarts; no in-memory state needed |
| Scheduler answers vs ConversationHandler | Scheduler sends first question; a global handler processes replies — more robust than FSM for async delivery |
| All scheduling in UTC | Avoids DST bugs; user can set a display timezone |
| SQLite sync + `expire_on_commit=False` | Simple, fast enough for a single user |
| MarkdownV2 throughout | Richer formatting; special chars escaped via `_esc()` |

---

## Data Schema

```
users           id, telegram_id, timezone
sessions        id, user_id, name, schedule_time, frequency, weekday, active
questions       id, session_id, text, type, config_json, order
session_runs    id, session_id, user_id, triggered_at, completed_at,
                current_question_index, status
answers         id, run_id, question_id, value, timestamp
```

`session_runs.status` values: `in_progress` → `reminded` → `completed` | `missed`

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | From @BotFather |
| `AUTHORIZED_USERS` | — | *(allow all)* | Comma-separated Telegram IDs |
| `DB_PATH` | — | `data/bot.db` | SQLite file path |
| `REMINDER_MINUTES` | — | `30` | Reminder delay |
| `LOG_LEVEL` | — | `INFO` | Python log level |

---

## Future Extensions

- **Analytics** — weekly summaries, streak tracking, trend charts (matplotlib)
- **AI reflections** — weekly narrative using Claude API
- **Multi-user** — already supported; just add more `AUTHORIZED_USERS`
- **Notification timezone** — convert UTC schedule time to local before display
- **Skip support** — `/skip` command to skip optional questions mid-session
