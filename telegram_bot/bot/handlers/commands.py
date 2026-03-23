"""One-shot command handlers: /start, /list_sessions, /delete_session,
/export, /stats, /history, /set_timezone, /help."""

import logging

from telegram import Update
from telegram.ext import ContextTypes

from ..database.db import get_db
from ..database.models import Answer, Question, Session, SessionRun, User
from ..utils.export import export_csv, export_json

logger = logging.getLogger(__name__)

HELP_TEXT = (
    "📋 *Self\\-Tracking Bot*\n\n"
    "/create\\_session — create a check\\-in session\n"
    "/add\\_question — add a question to a session\n"
    "/list\\_sessions — list your sessions\n"
    "/delete\\_session `<id>` — remove a session\n"
    "/export `[csv|json]` — download your data\n"
    "/stats — summary statistics\n"
    "/history — recent completed check\\-ins\n"
    "/set\\_timezone `<tz>` — set your timezone \\(display only\\)\n"
    "/help — show this message\n\n"
    "Use /cancel inside any setup flow to abort\\."
)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_tg_id = update.effective_user.id
    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=user_tg_id).first()
        if not user:
            db.add(User(telegram_id=user_tg_id))
            greeting = "👋 Welcome to your *Self\\-Tracking Bot*\\!\n\n"
        else:
            greeting = "👋 Welcome back\\!\n\n"

    await update.message.reply_text(greeting + HELP_TEXT, parse_mode="MarkdownV2")


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(HELP_TEXT, parse_mode="MarkdownV2")


async def cmd_list_sessions(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_tg_id = update.effective_user.id
    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=user_tg_id).first()
        if not user:
            await update.message.reply_text("Use /start first.")
            return

        sessions = db.query(Session).filter_by(user_id=user.id, active=True).all()
        if not sessions:
            await update.message.reply_text("No sessions yet\\. Create one with /create\\_session", parse_mode="MarkdownV2")
            return

        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        lines = ["*Your Sessions:*\n"]
        for s in sessions:
            q_count = db.query(Question).filter_by(session_id=s.id).count()
            freq = "Daily" if s.frequency == "daily" else f"Weekly \\({days[s.weekday]}\\)"
            lines.append(
                f"• *{_esc(s.name)}* — `{s.schedule_time}` UTC — {freq} — "
                f"{q_count} question\\(s\\) — ID: `{s.id}`"
            )

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


async def cmd_delete_session(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_tg_id = update.effective_user.id
    args = context.args

    if not args:
        await update.message.reply_text(
            "Usage: `/delete_session <id>`\nGet IDs with /list\\_sessions",
            parse_mode="MarkdownV2",
        )
        return

    try:
        session_id = int(args[0])
    except ValueError:
        await update.message.reply_text("Invalid session ID.")
        return

    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=user_tg_id).first()
        if not user:
            await update.message.reply_text("Use /start first.")
            return
        session = db.query(Session).filter_by(id=session_id, user_id=user.id, active=True).first()
        if not session:
            await update.message.reply_text("Session not found\\.", parse_mode="MarkdownV2")
            return
        session.active = False
        name = session.name

    from ..scheduler.scheduler import remove_session_job
    remove_session_job(session_id)

    await update.message.reply_text(f"✅ Session *{_esc(name)}* deleted\\.", parse_mode="MarkdownV2")


async def cmd_export(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_tg_id = update.effective_user.id
    args = context.args
    fmt = args[0].lower() if args else "csv"

    if fmt not in ("csv", "json"):
        await update.message.reply_text("Usage: `/export [csv|json]`", parse_mode="MarkdownV2")
        return

    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=user_tg_id).first()
        if not user:
            await update.message.reply_text("No data yet\\.", parse_mode="MarkdownV2")
            return

        if fmt == "csv":
            content, filename = export_csv(db, user.id)
        else:
            content, filename = export_json(db, user.id)

    await update.message.reply_document(
        document=content,
        filename=filename,
        caption=f"Your tracking data ({fmt.upper()})",
    )


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_tg_id = update.effective_user.id
    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=user_tg_id).first()
        if not user:
            await update.message.reply_text("No data yet\\. Use /start first\\.", parse_mode="MarkdownV2")
            return

        total_completed = db.query(SessionRun).filter_by(user_id=user.id, status="completed").count()
        total_missed = db.query(SessionRun).filter_by(user_id=user.id, status="missed").count()
        total_answers = (
            db.query(Answer)
            .join(SessionRun, Answer.run_id == SessionRun.id)
            .filter(SessionRun.user_id == user.id)
            .count()
        )
        sessions = db.query(Session).filter_by(user_id=user.id, active=True).all()

        lines = [
            "📊 *Your Stats*\n",
            f"Completed check\\-ins: *{total_completed}*",
            f"Missed check\\-ins: *{total_missed}*",
            f"Total answers recorded: *{total_answers}*",
            f"Active sessions: *{len(sessions)}*",
        ]

        for s in sessions:
            runs = db.query(SessionRun).filter_by(session_id=s.id, status="completed").count()

            # Compute averages for scale / numeric questions
            q_lines = []
            questions = db.query(Question).filter_by(session_id=s.id).order_by(Question.order).all()
            for q in questions:
                if q.type in ("scale", "numeric"):
                    answers = (
                        db.query(Answer)
                        .join(SessionRun, Answer.run_id == SessionRun.id)
                        .filter(Answer.question_id == q.id, SessionRun.status == "completed")
                        .all()
                    )
                    if answers:
                        values = [float(a.value) for a in answers]
                        avg = sum(values) / len(values)
                        q_lines.append(f"    └ {_esc(q.text)}: avg *{avg:.1f}*")

            lines.append(f"\n*{_esc(s.name)}*: {runs} runs")
            lines.extend(q_lines)

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


async def cmd_history(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_tg_id = update.effective_user.id
    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=user_tg_id).first()
        if not user:
            await update.message.reply_text("No data yet\\. Use /start first\\.", parse_mode="MarkdownV2")
            return

        runs = (
            db.query(SessionRun)
            .filter_by(user_id=user.id, status="completed")
            .order_by(SessionRun.triggered_at.desc())
            .limit(10)
            .all()
        )
        if not runs:
            await update.message.reply_text("No completed check\\-ins yet\\.", parse_mode="MarkdownV2")
            return

        lines = ["📜 *Recent Check\\-ins:*\n"]
        for run in runs:
            session = db.get(Session, run.session_id)
            date_str = run.triggered_at.strftime("%Y\\-%m\\-%d %H:%M")
            answer_count = db.query(Answer).filter_by(run_id=run.id).count()
            lines.append(
                f"• *{_esc(session.name)}* — `{date_str}` UTC — {answer_count} answers"
            )

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


async def cmd_set_timezone(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Store a display timezone for the user. Scheduling always uses UTC."""
    args = context.args
    if not args:
        await update.message.reply_text(
            "Usage: `/set_timezone <timezone>`\ne\\.g\\. `/set_timezone Europe/Berlin`\n\n"
            "Note: scheduling is always in UTC\\. This only affects display\\.",
            parse_mode="MarkdownV2",
        )
        return

    tz_name = args[0]
    # Basic validation
    try:
        import zoneinfo
        zoneinfo.ZoneInfo(tz_name)
    except Exception:
        await update.message.reply_text(
            f"Unknown timezone `{_esc(tz_name)}`\\. "
            "Use IANA names like `Europe/Berlin` or `America/New_York`\\.",
            parse_mode="MarkdownV2",
        )
        return

    with get_db() as db:
        user = db.query(User).filter_by(telegram_id=update.effective_user.id).first()
        if not user:
            await update.message.reply_text("Use /start first.")
            return
        user.timezone = tz_name

    await update.message.reply_text(
        f"✅ Timezone set to `{_esc(tz_name)}`\\.",
        parse_mode="MarkdownV2",
    )


def _esc(text: str) -> str:
    special = r"\_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{c}" if c in special else c for c in str(text))
