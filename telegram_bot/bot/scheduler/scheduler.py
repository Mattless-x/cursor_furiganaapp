"""APScheduler setup, session job management, and question delivery."""

import json
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..database.db import get_db
from ..database.models import Question, Session, SessionRun, User
from ..utils.keyboards import boolean_keyboard, multi_choice_keyboard, scale_keyboard

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")

_WEEKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


def start_scheduler() -> None:
    scheduler.start()
    logger.info("APScheduler started.")


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)


# ---------------------------------------------------------------------------
# Job management
# ---------------------------------------------------------------------------


def add_session_job(
    session_id: int,
    session_name: str,
    time_str: str,
    frequency: str,
    weekday: int | None,
    telegram_id: int,
    bot,
) -> None:
    hour, minute = map(int, time_str.split(":"))

    if frequency == "daily":
        trigger = CronTrigger(hour=hour, minute=minute, timezone="UTC")
    else:
        trigger = CronTrigger(
            day_of_week=_WEEKDAY_NAMES[weekday],
            hour=hour,
            minute=minute,
            timezone="UTC",
        )

    scheduler.add_job(
        _trigger_session,
        trigger=trigger,
        args=[session_id, telegram_id, bot],
        id=f"session_{session_id}",
        replace_existing=True,
        misfire_grace_time=300,
    )
    logger.info("Scheduled session %d (%s) at %s %s", session_id, session_name, time_str, frequency)


def remove_session_job(session_id: int) -> None:
    job_id = f"session_{session_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("Removed job for session %d", session_id)


def load_all_jobs(bot) -> None:
    """Re-register all active session jobs on bot startup."""
    with get_db() as db:
        sessions = db.query(Session).filter_by(active=True).all()
        for s in sessions:
            user = db.get(User, s.user_id)
            if not user:
                continue
            add_session_job(
                s.id, s.name, s.schedule_time, s.frequency,
                s.weekday, user.telegram_id, bot,
            )

        # Mark stale in-progress runs as missed
        stale_cutoff = datetime.utcnow() - timedelta(hours=6)
        stale = (
            db.query(SessionRun)
            .filter(SessionRun.status.in_(["in_progress", "reminded"]))
            .filter(SessionRun.triggered_at < stale_cutoff)
            .all()
        )
        for run in stale:
            run.status = "missed"
        if stale:
            logger.info("Marked %d stale runs as missed.", len(stale))


# ---------------------------------------------------------------------------
# Session triggering
# ---------------------------------------------------------------------------


async def _trigger_session(session_id: int, telegram_id: int, bot) -> None:
    """Called by APScheduler when a session fires."""
    with get_db() as db:
        session = db.get(Session, session_id)
        if not session or not session.active:
            return

        questions = (
            db.query(Question)
            .filter_by(session_id=session_id)
            .order_by(Question.order)
            .all()
        )

        if not questions:
            await bot.send_message(
                telegram_id,
                f"📋 *{session.name}* has no questions yet\\. Add some with /add\\_question",
                parse_mode="MarkdownV2",
            )
            return

        user = db.get(User, session.user_id)
        run = SessionRun(session_id=session_id, user_id=user.id)
        db.add(run)
        db.flush()
        run_id = run.id
        session_name = session.name
        first_question = questions[0]

    logger.info("Triggering session %d (run %d) for user %d", session_id, run_id, telegram_id)

    await bot.send_message(
        telegram_id,
        f"⏰ Time for *{session_name}*\\!",
        parse_mode="MarkdownV2",
    )
    await send_question(bot, telegram_id, first_question, run_id)

    # Schedule reminder if user doesn't respond
    from ..config import Config

    remind_at = datetime.utcnow() + timedelta(minutes=Config.REMINDER_MINUTES)
    scheduler.add_job(
        _send_reminder,
        "date",
        run_date=remind_at,
        args=[run_id, telegram_id, bot],
        id=f"reminder_{run_id}",
        replace_existing=True,
    )


async def _send_reminder(run_id: int, telegram_id: int, bot) -> None:
    with get_db() as db:
        run = db.get(SessionRun, run_id)
        if not run or run.status not in ("in_progress",):
            return
        run.status = "reminded"

    await bot.send_message(
        telegram_id,
        "⏰ *Reminder*: You have a pending check\\-in\\! Please answer the question above\\.",
        parse_mode="MarkdownV2",
    )


def cancel_reminder(run_id: int) -> None:
    job_id = f"reminder_{run_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


# ---------------------------------------------------------------------------
# Question delivery
# ---------------------------------------------------------------------------


async def send_question(bot, chat_id: int, question: Question, run_id: int) -> None:
    """Send a single question with the appropriate keyboard or prompt."""
    prefix = f"ans:{run_id}:{question.id}"
    cfg = question.config

    if question.type == "scale":
        min_v = cfg.get("min", 1)
        max_v = cfg.get("max", 5)
        text = f"*Q:* {_esc(question.text)}\n_\\(Scale: {min_v}–{max_v}\\)_"
        await bot.send_message(
            chat_id,
            text,
            parse_mode="MarkdownV2",
            reply_markup=scale_keyboard(min_v, max_v, prefix),
        )

    elif question.type == "boolean":
        await bot.send_message(
            chat_id,
            f"*Q:* {_esc(question.text)}",
            parse_mode="MarkdownV2",
            reply_markup=boolean_keyboard(prefix),
        )

    elif question.type == "multi_choice":
        choices = cfg.get("choices", [])
        await bot.send_message(
            chat_id,
            f"*Q:* {_esc(question.text)}",
            parse_mode="MarkdownV2",
            reply_markup=multi_choice_keyboard(choices, prefix),
        )

    elif question.type == "numeric":
        await bot.send_message(
            chat_id,
            f"*Q:* {_esc(question.text)}\n_\\(enter a number\\)_",
            parse_mode="MarkdownV2",
        )

    else:  # text
        await bot.send_message(
            chat_id,
            f"*Q:* {_esc(question.text)}",
            parse_mode="MarkdownV2",
        )


def _esc(text: str) -> str:
    """Escape special MarkdownV2 characters in user-supplied text."""
    special = r"\_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{c}" if c in special else c for c in text)
