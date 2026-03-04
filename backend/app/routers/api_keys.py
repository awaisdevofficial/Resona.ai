from datetime import datetime
from typing import List, Optional
import hashlib
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.api_key import ApiKey
from app.models.user import User


router = APIRouter()


class ApiKeyCreate(BaseModel):
    name: str
    expires_at: Optional[datetime] = None


class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    name: Optional[str]
    prefix: str
    last_used: Optional[datetime]
    expires_at: Optional[datetime]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=List[ApiKeyResponse])
async def list_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user.id, ApiKey.is_active.is_(True))
        .order_by(ApiKey.created_at.desc())
    )
    return result.scalars().all()


@router.post("", status_code=201)
async def create_key(
    body: ApiKeyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_key = f"res_live_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    prefix = raw_key[:16]

    record = ApiKey(
        id=uuid.uuid4(),
        user_id=user.id,
        name=body.name,
        key_hash=key_hash,
        prefix=prefix,
        expires_at=body.expires_at,
    )
    db.add(record)
    await db.commit()
    return {
        "id": str(record.id),
        "name": record.name,
        "key": raw_key,
        "prefix": prefix,
        "created_at": record.created_at.isoformat(),
    }


@router.delete("/{key_id}", status_code=204)
async def revoke_key(
    key_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await db.get(ApiKey, key_id)
    if not record or record.user_id != user.id:
        raise HTTPException(status_code=404, detail="Key not found")
    record.is_active = False
    await db.commit()

