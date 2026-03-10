"""
Alembic env.py — use DATABASE_URL from app config (env/.env).
Converts postgresql+asyncpg to postgresql for sync migrations (psycopg2).
"""
import os
import sys

# Ensure backend app is on path when run from backend dir (e.g. in Docker /app)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

# Import app config so DATABASE_URL is loaded from env
from app.config import settings

config = context.config

# Use sync URL for Alembic (postgresql+psycopg2)
database_url = (settings.DATABASE_URL or "").strip()
if database_url.startswith("postgresql+asyncpg://") or database_url.startswith("postgresql+asyncpg:"):
    database_url = database_url.replace("postgresql+asyncpg", "postgresql", 1)
if database_url and not database_url.startswith("postgresql://") and database_url.startswith("postgresql"):
    database_url = database_url.replace("postgresql:", "postgresql://", 1)
if not database_url:
    database_url = "postgresql://localhost/resona"
config.set_main_option("sqlalchemy.url", database_url)

# No Base.metadata for this project — migrations are explicit scripts
# target_metadata = None

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = create_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
