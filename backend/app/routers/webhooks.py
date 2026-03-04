from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.webhook import Webhook
from app.schemas.webhook import WebhookCreate, WebhookResponse, WebhookUpdate


router = APIRouter()


@router.get("", response_model=List[WebhookResponse])
async def list_webhooks(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Webhook)
        .where(Webhook.user_id == user.id, Webhook.is_active.is_(True))
        .order_by(Webhook.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: WebhookCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    webhook = Webhook(
        id=uuid.uuid4(),
        user_id=user.id,
        url=body.url,
        events=body.events or [],
        secret=body.secret,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    return webhook


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(
    webhook_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    webhook = await db.get(Webhook, webhook_id)
    if not webhook or webhook.user_id != user.id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhook


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: uuid.UUID,
    body: WebhookUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    webhook = await db.get(Webhook, webhook_id)
    if not webhook or webhook.user_id != user.id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(webhook, field, value)
    await db.commit()
    await db.refresh(webhook)
    return webhook


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    webhook = await db.get(Webhook, webhook_id)
    if not webhook or webhook.user_id != user.id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    webhook.is_active = False
    await db.commit()
