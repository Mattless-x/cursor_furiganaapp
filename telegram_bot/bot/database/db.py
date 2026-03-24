import os
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from .models import Base

_engine = None
_SessionLocal = None


def init_db(db_path: str) -> None:
    global _engine, _SessionLocal

    # Ensure parent directory exists
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)

    _engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(_engine)
    _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)


@contextmanager
def get_db() -> Session:
    """Yield a DB session with automatic commit/rollback."""
    db: Session = _SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
