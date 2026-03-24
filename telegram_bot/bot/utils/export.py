"""CSV and JSON export helpers."""

import csv
import io
import json
from datetime import datetime

from sqlalchemy.orm import Session as DbSession

from ..database.models import Answer, Question, Session, SessionRun


def export_csv(db: DbSession, user_id: int) -> tuple[io.BytesIO, str]:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["run_id", "session", "triggered_at", "question", "type", "value", "answered_at"])

    runs = (
        db.query(SessionRun)
        .filter(SessionRun.user_id == user_id, SessionRun.status == "completed")
        .order_by(SessionRun.triggered_at)
        .all()
    )
    for run in runs:
        session = db.get(Session, run.session_id)
        answers = db.query(Answer).filter_by(run_id=run.id).all()
        for ans in answers:
            q = db.get(Question, ans.question_id)
            writer.writerow([
                run.id,
                session.name,
                run.triggered_at.isoformat(),
                q.text,
                q.type,
                ans.value,
                ans.timestamp.isoformat(),
            ])

    content = output.getvalue().encode("utf-8")
    filename = f"tracking_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return io.BytesIO(content), filename


def export_json(db: DbSession, user_id: int) -> tuple[io.BytesIO, str]:
    sessions = db.query(Session).filter_by(user_id=user_id).all()
    data = []

    for s in sessions:
        runs = (
            db.query(SessionRun)
            .filter_by(session_id=s.id, status="completed")
            .order_by(SessionRun.triggered_at)
            .all()
        )
        session_entry = {
            "session": s.name,
            "schedule": s.schedule_time,
            "frequency": s.frequency,
            "weekday": s.weekday,
            "runs": [],
        }
        for run in runs:
            answers = db.query(Answer).filter_by(run_id=run.id).all()
            session_entry["runs"].append({
                "run_id": run.id,
                "triggered_at": run.triggered_at.isoformat(),
                "answers": [
                    {
                        "question": db.get(Question, ans.question_id).text,
                        "type": db.get(Question, ans.question_id).type,
                        "value": ans.value,
                        "timestamp": ans.timestamp.isoformat(),
                    }
                    for ans in answers
                ],
            })
        data.append(session_entry)

    content = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
    filename = f"tracking_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    return io.BytesIO(content), filename
