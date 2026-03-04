from typing import Optional
import uuid

import httpx
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User


# Allow missing Authorization header in local/dev when DEV_MODE is enabled
security = HTTPBearer(auto_error=False)


async def _get_or_create_dev_user(db: AsyncSession) -> User:
    """Return a stable dev user when running without auth in DEV_MODE."""
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    user = result.scalar_one_or_none()
    if user:
        return user

    dev_user = User(
        id=uuid.uuid4(),
        clerk_id="dev-user",
        email="dev@example.com",
        name="Dev User",
    )
    db.add(dev_user)
    await db.commit()
    await db.refresh(dev_user)
    return dev_user


async def _get_supabase_user(token: str) -> dict:
    """
    Validate a Supabase access token by calling the Supabase Auth /user endpoint.

    This avoids hard-coding JWT secrets or JWKS logic here and delegates
    verification to Supabase.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase auth is not configured on the server",
        )

    url = f"{settings.SUPABASE_URL}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers=headers)

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return resp.json()


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    # In development, allow requests without Authorization and use a seeded dev user
    if credentials is None:
        if settings.DEV_MODE:
            return await _get_or_create_dev_user(db)
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
    supabase_user = await _get_supabase_user(token)

    # Supabase user ID is a stable identifier we store in the auth ID field
    auth_id: Optional[str] = supabase_user.get("id")
    if not auth_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.clerk_id == auth_id))
    user = result.scalar_one_or_none()

    if not user:
        email = supabase_user.get("email") or ""
        # Supabase user_metadata may contain a name; fall back to email
        user_metadata = supabase_user.get("user_metadata") or {}
        name = user_metadata.get("name") or email

        user = User(id=uuid.uuid4(), clerk_id=auth_id, email=email, name=name)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


async def verify_internal_secret(request: Request):
    secret = request.headers.get("X-Internal-Secret")
    if secret != settings.INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

