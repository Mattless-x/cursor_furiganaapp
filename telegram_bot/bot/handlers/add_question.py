"""ConversationHandler for /add_question."""

import json
import logging

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from ..database.db import get_db
from ..database.models import Question, Session, User
from ..utils.keyboards import confirm_keyboard, question_type_keyboard, sessions_keyboard

logger = logging.getLogger(__name__)

# FSM states (offset by 10 to avoid collision with create_session states)
Q_SESSION, Q_TEXT, Q_TYPE, Q_SCALE_MIN, Q_SCALE_MAX, Q_CHOICES, Q_CONFIRM = range(10, 17)


async def cmd_add_question(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user_tg_id = update.effective_user.id
    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=user_tg_id).first()
        if not user:
            await update.message.reply_text("Use /start first.")
            return ConversationHandler.END
        sessions = db.query(Session).filter_by(user_id=user.id, active=True).all()
        if not sessions:
            await update.message.reply_text("No sessions yet. Create one with /create\\_session", parse_mode="MarkdownV2")
            return ConversationHandler.END
        kbd = sessions_keyboard(sessions, "qsess")

    await update.message.reply_text("Which session should this question belong to?", reply_markup=kbd)
    return Q_SESSION


async def got_session(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    session_id = int(query.data.split(":")[1])

    with get_db() as db:
        session = db.get(Session, session_id)
        if not session:
            await query.edit_message_text("Session not found.")
            return ConversationHandler.END

    context.user_data["nq"] = {"session_id": session_id, "session_name": session.name}
    await query.edit_message_text(
        f"Adding a question to *{_esc(session.name)}*\\.\n\nEnter the question text:",
        parse_mode="MarkdownV2",
    )
    return Q_TEXT


async def got_question_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if not text or len(text) > 300:
        await update.message.reply_text("Please enter a question (1–300 characters).")
        return Q_TEXT

    context.user_data["nq"]["text"] = text
    await update.message.reply_text("What type of answer do you expect?", reply_markup=question_type_keyboard())
    return Q_TYPE


async def got_question_type(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    qtype = query.data.split(":")[1]
    context.user_data["nq"]["type"] = qtype
    context.user_data["nq"]["config"] = {}

    if qtype == "scale":
        await query.edit_message_text("Minimum value for the scale? \\(e\\.g\\. `1`\\)", parse_mode="MarkdownV2")
        return Q_SCALE_MIN

    if qtype == "multi_choice":
        await query.edit_message_text(
            "Enter the choices separated by commas:\ne\\.g\\. `Happy, Neutral, Sad`",
            parse_mode="MarkdownV2",
        )
        return Q_CHOICES

    # boolean / text / numeric → no extra config needed
    return await _show_confirm_text(query, context)


async def got_scale_min(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = int(update.message.text.strip())
    except ValueError:
        await update.message.reply_text("Please enter a whole number.")
        return Q_SCALE_MIN

    context.user_data["nq"]["config"]["min"] = val
    await update.message.reply_text(f"Maximum value? \\(must be \\> {val}\\)", parse_mode="MarkdownV2")
    return Q_SCALE_MAX


async def got_scale_max(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = int(update.message.text.strip())
    except ValueError:
        await update.message.reply_text("Please enter a whole number.")
        return Q_SCALE_MAX

    min_val = context.user_data["nq"]["config"]["min"]
    if val <= min_val:
        await update.message.reply_text(f"Maximum must be greater than {min_val}\\.", parse_mode="MarkdownV2")
        return Q_SCALE_MAX
    if val - min_val > 20:
        await update.message.reply_text("Range too large \\(max 20 steps\\)\\. Enter a smaller value\\.", parse_mode="MarkdownV2")
        return Q_SCALE_MAX

    context.user_data["nq"]["config"]["max"] = val
    return await _show_confirm_msg(update, context)


async def got_choices(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    raw = update.message.text.strip()
    choices = [c.strip() for c in raw.split(",") if c.strip()]
    if len(choices) < 2:
        await update.message.reply_text("Provide at least 2 choices, separated by commas.")
        return Q_CHOICES
    if len(choices) > 10:
        await update.message.reply_text("Maximum 10 choices.")
        return Q_CHOICES

    context.user_data["nq"]["config"]["choices"] = choices
    return await _show_confirm_msg(update, context)


async def _show_confirm_msg(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Send confirmation via a regular message (for text-input steps)."""
    text = _summary(context.user_data["nq"])
    await update.message.reply_text(text, parse_mode="MarkdownV2", reply_markup=confirm_keyboard("newq"))
    return Q_CONFIRM


async def _show_confirm_text(query, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Send confirmation by editing the existing message (for callback-input steps)."""
    text = _summary(context.user_data["nq"])
    await query.edit_message_text(text, parse_mode="MarkdownV2", reply_markup=confirm_keyboard("newq"))
    return Q_CONFIRM


def _summary(nq: dict) -> str:
    cfg_str = json.dumps(nq.get("config", {})) if nq.get("config") else "—"
    return (
        f"*New Question*\n\n"
        f"Session: {_esc(nq['session_name'])}\n"
        f"Question: {_esc(nq['text'])}\n"
        f"Type: `{nq['type']}`\n"
        f"Config: `{cfg_str}`\n\n"
        "Add this question?"
    )


async def got_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    action = query.data.split(":")[1]

    if action == "cancel":
        context.user_data.pop("nq", None)
        await query.edit_message_text("Cancelled.")
        return ConversationHandler.END

    nq = context.user_data.pop("nq")

    with get_db() as db:
        order = db.query(Question).filter_by(session_id=nq["session_id"]).count()
        q = Question(
            session_id=nq["session_id"],
            text=nq["text"],
            type=nq["type"],
            config_json=json.dumps(nq.get("config", {})),
            order=order,
        )
        db.add(q)

    await query.edit_message_text(
        f"✅ Question added to *{_esc(nq['session_name'])}*\\!",
        parse_mode="MarkdownV2",
    )
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("nq", None)
    await update.message.reply_text("Cancelled.")
    return ConversationHandler.END


def add_question_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("add_question", cmd_add_question)],
        states={
            Q_SESSION: [CallbackQueryHandler(got_session, pattern=r"^qsess:")],
            Q_TEXT: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_question_text)],
            Q_TYPE: [CallbackQueryHandler(got_question_type, pattern=r"^qtype:")],
            Q_SCALE_MIN: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_scale_min)],
            Q_SCALE_MAX: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_scale_max)],
            Q_CHOICES: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_choices)],
            Q_CONFIRM: [CallbackQueryHandler(got_confirm, pattern=r"^newq:")],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        name="add_question",
    )


def _esc(text: str) -> str:
    special = r"\_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{c}" if c in special else c for c in text)
