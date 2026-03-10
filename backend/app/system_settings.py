"""
Load API keys from api-keys table only (no env fallback).
On API failure, try the next row in the table.
"""

import asyncio
import os
from typing import Optional

# All rows from api-keys table: list of {"OPENAI_API_KEY": str, "ELEVENLABS_API_KEY": str}
_api_keys_rows: list[dict[str, str]] = []


def get_api_key(key: str) -> str:
    """Return first row's value for key. No env fallback — DB only."""
    if not _api_keys_rows:
        return ""
    row = _api_keys_rows[0]
    val = row.get(key)
    return (val or "").strip() if val else ""


def get_elevenlabs_api_key() -> str:
    """Default: first row's ElevenLabs key."""
    return get_api_key("ELEVENLABS_API_KEY")


def get_openai_api_key() -> str:
    """Default: first row's OpenAI key."""
    return get_api_key("OPENAI_API_KEY")


def get_elevenlabs_keys_ordered() -> list[str]:
    """All ElevenLabs keys in table order; use next on failure."""
    out: list[str] = []
    for row in _api_keys_rows:
        v = (row.get("ELEVENLABS_API_KEY") or "").strip()
        if v:
            out.append(v)
    return out


def get_openai_keys_ordered() -> list[str]:
    """All OpenAI keys in table order; use next on failure."""
    out: list[str] = []
    for row in _api_keys_rows:
        v = (row.get("OPENAI_API_KEY") or "").strip()
        if v:
            out.append(v)
    return out


async def load_cache_from_db() -> None:
    """Load all rows from api-keys table. No env fallback. Call from FastAPI lifespan."""
    global _api_keys_rows
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.service_api_keys import ServiceApiKeys

    _api_keys_rows = []
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ServiceApiKeys).order_by(ServiceApiKeys.id)
            )
            rows = result.scalars().all()
            for row in rows:
                d: dict[str, str] = {}
                if row.OPENAI_API_KEY and str(row.OPENAI_API_KEY).strip():
                    d["OPENAI_API_KEY"] = str(row.OPENAI_API_KEY).strip()
                if row.ELEVENLABS_API_KEY and str(row.ELEVENLABS_API_KEY).strip():
                    d["ELEVENLABS_API_KEY"] = str(row.ELEVENLABS_API_KEY).strip()
                if d:
                    _api_keys_rows.append(d)
    except Exception as e:
        import logging
        logging.getLogger("app.system_settings").warning("Could not load api-keys from DB: %s", e)


async def load_from_db_standalone(database_url: str) -> list[dict[str, str]]:
    """
    Load all rows from api-keys table. No app imports.
    Returns list of {"OPENAI_API_KEY": str, "ELEVENLABS_API_KEY": str} (only non-empty keys).
    """
    try:
        import asyncpg
    except ImportError:
        return []
    if not (database_url or "").strip():
        return []
    conn_str = database_url.replace("postgresql+asyncpg://", "postgres://", 1)
    out: list[dict[str, str]] = []
    try:
        conn = await asyncpg.connect(conn_str)
        try:
            rows = await conn.fetch(
                'SELECT "OPENAI_API_KEY", "ELEVENLABS_API_KEY" FROM "api-keys" ORDER BY id'
            )
            for row in rows:
                d: dict[str, str] = {}
                v = row.get("OPENAI_API_KEY")
                if v and str(v).strip():
                    d["OPENAI_API_KEY"] = str(v).strip()
                v = row.get("ELEVENLABS_API_KEY")
                if v and str(v).strip():
                    d["ELEVENLABS_API_KEY"] = str(v).strip()
                if d:
                    out.append(d)
        finally:
            await conn.close()
    except Exception:
        pass
    return out


def run_load_system_settings_into_env() -> None:
    """
    Load api-keys from DB; use first row for env (agent worker). No env fallback.
    """
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        return
    rows = asyncio.run(load_from_db_standalone(database_url))
    if not rows:
        return
    first = rows[0]
    for k, v in first.items():
        if k and v:
            os.environ[k] = v
    # Populate in-memory rows so any code that runs after can use get_*_keys_ordered
    global _api_keys_rows
    _api_keys_rows = rows
