import json
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Index
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(Integer, unique=True, nullable=False, index=True)
    # IANA timezone name, e.g. "Europe/Berlin" – used for schedule display
    timezone = Column(String, default="UTC")
    created_at = Column(DateTime, default=datetime.utcnow)


class Session(Base):
    """A recurring check-in session owned by a user."""

    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    # "HH:MM" in UTC
    schedule_time = Column(String(5), nullable=False)
    # "daily" | "weekly"
    frequency = Column(String(10), default="daily")
    # 0=Monday … 6=Sunday – only used when frequency=="weekly"
    weekday = Column(Integer, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_sessions_user_active", "user_id", "active"),)


class Question(Base):
    """A single question belonging to a session."""

    __tablename__ = "questions"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    text = Column(Text, nullable=False)
    # scale | boolean | text | numeric | multi_choice
    type = Column(String(20), nullable=False)
    # JSON with type-specific settings:
    #   scale       → {"min": 1, "max": 5}
    #   multi_choice → {"choices": ["A", "B", "C"]}
    #   numeric     → {"allow_float": true}
    config_json = Column(Text, default="{}")
    # display / answer order within the session
    order = Column(Integer, default=0)

    @property
    def config(self) -> dict:
        return json.loads(self.config_json)

    __table_args__ = (Index("ix_questions_session_order", "session_id", "order"),)


class SessionRun(Base):
    """One triggered instance of a session (e.g. tonight's Evening check-in)."""

    __tablename__ = "session_runs"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    # Denormalised for fast look-ups without a join
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    triggered_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    # Index of the *next* question to ask (0-based)
    current_question_index = Column(Integer, default=0)
    # in_progress | reminded | completed | missed
    status = Column(String(20), default="in_progress")

    __table_args__ = (
        Index("ix_runs_user_status", "user_id", "status"),
    )


class Answer(Base):
    """A single answer recorded inside a session run."""

    __tablename__ = "answers"

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("session_runs.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    # All values stored as strings; callers cast on read
    value = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
