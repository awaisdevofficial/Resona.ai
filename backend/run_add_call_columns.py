"""
One-off script to add summary and analysis columns to the calls table.
Run from backend directory: python run_add_call_columns.py
"""
import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

# Use sync driver for running DDL (asyncpg can run it too, but we use raw connection)
try:
    import asyncpg
except ImportError:
    print("Install asyncpg: pip install asyncpg")
    raise

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("Set DATABASE_URL in .env")
    exit(1)
# asyncpg uses postgresql:// not postgresql+asyncpg://
conn_str = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


async def main():
    conn = await asyncpg.connect(conn_str)
    try:
        await conn.execute("ALTER TABLE calls ADD COLUMN IF NOT EXISTS summary TEXT")
        await conn.execute("ALTER TABLE calls ADD COLUMN IF NOT EXISTS analysis JSONB")
        print("Done. Added columns: calls.summary, calls.analysis")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
