"""ConversationHandler for /create_session."""

import re
import logging

from telegram import Update
from telegram.ext import (
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from ..database.db import get_db
from ..database.models import Session, User
from ..utils.keyboards import confirm_keyboard, frequency_keyboard, weekday_keyboard

logger = logging.getLogger(__name__)

# FSM states
SESSION_NAME, SESSION_TIME, SESSION_FREQ, SESSION_WEEKDAY, SESSION_CONFIRM = range(5)

_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


async def cmd_create_session(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "Let's create a new check\\-in session\\!\n\nWhat should we call it? \\(e\\.g\\. *Morning*, *Evening*\\)",
        parse_mode="MarkdownV2",
    )
    return SESSION_NAME


async def got_session_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    name = update.message.text.strip()
    if not name or len(name) > 60:
        await update.message.reply_text("Please enter a name (1–60 characters).")
        return SESSION_NAME

    context.user_data["ns"] = {"name": name}
    await update.message.reply_text(
        f"Great\\! What time should *{_esc(name)}* run?\n\n"
        "Enter in `HH:MM` 24h format \\(UTC\\), e\\.g\\. `09:00` or `21:30`\\.",
        parse_mode="MarkdownV2",
    )
    return SESSION_TIME


async def got_session_time(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    time_str = update.message.text.strip()
    if not _TIME_RE.match(time_str):
        await update.message.reply_text(
            "Invalid format\\. Please use `HH:MM`, e\\.g\\. `09:00`\\.",
            parse_mode="MarkdownV2",
        )
        return SESSION_TIME

    context.user_data["ns"]["time"] = time_str
    await update.message.reply_text(
        "How often should this session run?",
        reply_markup=frequency_keyboard(),
    )
    return SESSION_FREQ


async def got_session_freq(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    freq = query.data.split(":")[1]
    context.user_data["ns"]["frequency"] = freq

    if freq == "weekly":
        await query.edit_message_text("Which day of the week?", reply_markup=weekday_keyboard())
        return SESSION_WEEKDAY

    context.user_data["ns"]["weekday"] = None
    return await _show_confirm(query, context)


async def got_session_weekday(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data["ns"]["weekday"] = int(query.data.split(":")[1])
    return await _show_confirm(query, context)


async def _show_confirm(query, context: ContextTypes.DEFAULT_TYPE) -> int:
    s = context.user_data["ns"]
    freq_str = "Daily" if s["frequency"] == "daily" else f"Weekly on {_DAYS[s['weekday']]}"
    text = (
        f"*New Session*\n\n"
        f"Name: {_esc(s['name'])}\n"
        f"Time: `{s['time']}` UTC\n"
        f"Frequency: {freq_str}\n\n"
        f"Create this session?"
    )
    await query.edit_message_text(text, parse_mode="MarkdownV2", reply_markup=confirm_keyboard("newsess"))
    return SESSION_CONFIRM


async def got_session_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    action = query.data.split(":")[1]

    if action == "cancel":
        context.user_data.pop("ns", None)
        await query.edit_message_text("Session creation cancelled.")
        return ConversationHandler.END

    s = context.user_data.pop("ns")

    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=update.effective_user.id).first()
        session = Session(
            user_id=user.id,
            name=s["name"],
            schedule_time=s["time"],
            frequency=s["frequency"],
            weekday=s.get("weekday"),
        )
        db.add(session)
        db.flush()
        session_id = session.id

    from ..scheduler.scheduler import add_session_job

    add_session_job(
        session_id, s["name"], s["time"], s["frequency"],
        s.get("weekday"), update.effective_user.id, context.bot,
    )

    await query.edit_message_text(
        f"✅ Session *{_esc(s['name'])}* created\\!\n"
        f"It will run at `{s['time']}` UTC\\.\n\n"
        "Add questions with /add\\_question",
        parse_mode="MarkdownV2",
    )
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("ns", None)
    await update.message.reply_text("Cancelled.")
    return ConversationHandler.END


def create_session_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("create_session", cmd_create_session)],
        states={
            SESSION_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_session_name)],
            SESSION_TIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_session_time)],
            SESSION_FREQ: [CallbackQueryHandler(got_session_freq, pattern=r"^freq:")],
            SESSION_WEEKDAY: [CallbackQueryHandler(got_session_weekday, pattern=r"^weekday:")],
            SESSION_CONFIRM: [CallbackQueryHandler(got_session_confirm, pattern=r"^newsess:")],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        name="create_session",
    )


def _esc(text: str) -> str:
    special = r"\_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{c}" if c in special else c for c in text)
