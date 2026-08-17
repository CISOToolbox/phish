from __future__ import annotations

import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# SQLite + aiosqlite default. Production should point at a host-mounted
# volume so the DB file survives container rebuilds (see docker-compose).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:////data/phish.db")

# aiosqlite has no real pool — connect_args is the right place for
# busy_timeout to soften the rare write-during-write contention.
_engine_kwargs: dict = {"echo": False}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"timeout": 30}

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# WAL + foreign-key enforcement for SQLite. WAL lets the public tracker
# endpoints read concurrently while the admin app writes. Foreign keys
# are off by default in SQLite — turn them on so ON DELETE CASCADE
# works the same way as on PostgreSQL.
if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event

    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragma(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
