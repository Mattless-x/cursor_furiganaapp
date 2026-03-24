"""Bot entry point."""

import logging

from telegram import Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    MessageHandler,
    filters,
)

from .config import Config
from .database.db import init_db
from .handlers.add_question import add_question_handler
from .handlers.answering import handle_answer_callback, handle_text_answer
from .handlers.commands import (
    cmd_delete_session,
    cmd_export,
    cmd_help,
    cmd_history,
    cmd_list_sessions,
    cmd_set_timezone,
    cmd_start,
    cmd_stats,
)
from .handlers.create_session import create_session_handler
from .scheduler.scheduler import load_all_jobs, start_scheduler


def _setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )
    # Silence noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)


async def _post_init(application: Application) -> None:
    init_db(Config.DB_PATH)
    start_scheduler()
    load_all_jobs(application.bot)
    logging.getLogger(__name__).info("Bot ready.")


def main() -> None:
    _setup_logging()

    # Build auth filter
    auth_filter = (
        filters.User(user_id=Config.AUTHORIZED_USERS)
        if Config.AUTHORIZED_USERS
        else filters.ALL
    )

    app = (
        Application.builder()
        .token(Config.BOT_TOKEN)
        .post_init(_post_init)
        .build()
    )

    # ── ConversationHandlers (must be registered before generic handlers) ──
    app.add_handler(create_session_handler())
    app.add_handler(add_question_handler())

    # ── Simple commands ──
    app.add_handler(CommandHandler("start", cmd_start, filters=auth_filter))
    app.add_handler(CommandHandler("help", cmd_help, filters=auth_filter))
    app.add_handler(CommandHandler("list_sessions", cmd_list_sessions, filters=auth_filter))
    app.add_handler(CommandHandler("delete_session", cmd_delete_session, filters=auth_filter))
    app.add_handler(CommandHandler("export", cmd_export, filters=auth_filter))
    app.add_handler(CommandHandler("stats", cmd_stats, filters=auth_filter))
    app.add_handler(CommandHandler("history", cmd_history, filters=auth_filter))
    app.add_handler(CommandHandler("set_timezone", cmd_set_timezone, filters=auth_filter))

    # ── Answering flow ──
    # Inline-button answers from scheduler-sent questions
    app.add_handler(CallbackQueryHandler(handle_answer_callback, pattern=r"^ans:"))
    # Free-text answers (only for text/numeric questions; ConversationHandlers take priority)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND & auth_filter, handle_text_answer))

    logging.getLogger(__name__).info("Starting polling…")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
