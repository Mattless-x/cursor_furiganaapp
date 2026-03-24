"""
Handles answers to check-in session questions.

Architecture
------------
When the scheduler fires it sends a question with a callback prefix
``ans:{run_id}:{question_id}``.

• Inline-button answers (scale / boolean / multi_choice) hit
  ``handle_answer_callback`` which parses the value from the callback data.

• Free-text answers (text / numeric) hit ``handle_text_answer`` which looks up
  the active SessionRun for the user and identifies the current question.

Both paths call ``_process_answer`` which persists the answer, advances the
run's question pointer, and sends the next question or completion message.
"""

import logging
from datetime import datetime

from telegram import Update
from telegram.ext import ContextTypes

from ..database.db import get_db
from ..database.models import Answer, Question, Session, SessionRun, User
from ..scheduler.scheduler import cancel_reminder, send_question

logger = logging.getLogger(__name__)


async def handle_answer_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Entry point for inline-button answers.

    callback_data format: ``ans:{run_id}:{question_id}:{value}``
    The value part may itself contain colons (e.g. multi-choice text).
    """
    query = update.callback_query
    await query.answer()

    parts = query.data.split(":", 3)
    if len(parts) != 4:
        logger.warning("Unexpected callback data: %s", query.data)
        return

    _, run_id_s, question_id_s, value = parts
    try:
        run_id = int(run_id_s)
        question_id = int(question_id_s)
    except ValueError:
        return

    # Remove the inline keyboard so the button press is visually acknowledged
    try:
        await query.edit_message_reply_markup(reply_markup=None)
    except Exception:
        pass

    await _process_answer(context, update.effective_chat.id, run_id, question_id, value)


async def handle_text_answer(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Entry point for free-text answers (text / numeric question types)."""
    user_tg_id = update.effective_user.id

    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=user_tg_id).first()
        if not user:
            return

        run = (
            db.query(SessionRun)
            .filter(
                SessionRun.user_id == user.id,
                SessionRun.status.in_(["in_progress", "reminded"]),
            )
            .order_by(SessionRun.triggered_at.desc())
            .first()
        )
        if not run:
            # No active session – ignore (could be random message)
            return

        questions = (
            db.query(Question)
            .filter_by(session_id=run.session_id)
            .order_by(Question.order)
            .all()
        )
        if run.current_question_index >= len(questions):
            return

        current_q = questions[run.current_question_index]

        if current_q.type not in ("text", "numeric"):
            await update.message.reply_text("Please use the buttons above to answer.")
            return

        value = update.message.text.strip()

        if current_q.type == "numeric":
            try:
                float(value)
            except ValueError:
                await update.message.reply_text("⚠️ Please enter a valid number.")
                return

        run_id = run.id
        question_id = current_q.id

    await _process_answer(context, update.effective_chat.id, run_id, question_id, value)


# ---------------------------------------------------------------------------
# Core answer processing
# ---------------------------------------------------------------------------


async def _process_answer(
    context: ContextTypes.DEFAULT_TYPE,
    chat_id: int,
    run_id: int,
    question_id: int,
    value: str,
) -> None:
    """Persist the answer, advance the run, send the next question or finish."""
    with get_db() as db:
        run = db.get(SessionRun, run_id)
        if not run or run.status not in ("in_progress", "reminded"):
            return

        # Guard: make sure the question belongs to this run's session
        q = db.get(Question, question_id)
        if not q or q.session_id != run.session_id:
            return

        # Validate that this is indeed the expected question
        questions = (
            db.query(Question)
            .filter_by(session_id=run.session_id)
            .order_by(Question.order)
            .all()
        )
        expected_idx = run.current_question_index
        if expected_idx >= len(questions) or questions[expected_idx].id != question_id:
            # Stale button press – silently ignore
            return

        db.add(Answer(run_id=run_id, question_id=question_id, value=value))

        run.current_question_index += 1
        next_idx = run.current_question_index
        is_done = next_idx >= len(questions)

        session_name = db.get(Session, run.session_id).name

        if is_done:
            run.status = "completed"
            run.completed_at = datetime.utcnow()
            next_q = None
        else:
            next_q_id = questions[next_idx].id

    cancel_reminder(run_id)

    if is_done:
        await context.bot.send_message(
            chat_id,
            f"✅ *{_esc(session_name)}* complete\\! Great job\\.",
            parse_mode="MarkdownV2",
        )
        logger.info("Run %d completed.", run_id)
    else:
        with get_db() as db:
            next_q = db.get(Question, next_q_id)
        await send_question(context.bot, chat_id, next_q, run_id)


def _esc(text: str) -> str:
    special = r"\_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{c}" if c in special else c for c in text)
