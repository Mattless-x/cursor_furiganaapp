import os


class Config:
    # Required
    BOT_TOKEN: str = os.environ["TELEGRAM_BOT_TOKEN"]

    # SQLite file path (inside the container it should be a mounted volume)
    DB_PATH: str = os.environ.get("DB_PATH", "data/bot.db")

    # Comma-separated Telegram user IDs that may use the bot.
    # Leave empty to allow everyone (not recommended for personal bots).
    _raw_users = os.environ.get("AUTHORIZED_USERS", "")
    AUTHORIZED_USERS: list[int] = [
        int(uid.strip())
        for uid in _raw_users.split(",")
        if uid.strip().isdigit()
    ]

    # Minutes before a reminder is sent for an unanswered check-in
    REMINDER_MINUTES: int = int(os.environ.get("REMINDER_MINUTES", "30"))

    # Python logging level
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
