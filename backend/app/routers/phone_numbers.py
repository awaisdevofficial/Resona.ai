import logging
from datetime import datetime
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.phone_number import PhoneNumber
from app.models.user import User
from app.schemas.phone_number import PhoneNumberAssign, PhoneNumberResponse
from app.services.twilio_client import get_twilio_client


router = APIRouter()
logger = logging.getLogger(__name__)


def _get_origination_uri() -> Optional[str]:
    """Twilio origination URI (e.g. LiveKit SIP) for linking imported/purchased numbers."""
    uri = (settings.LIVEKIT_SIP_URI or "").strip()
    if uri:
        return uri
    if settings.LIVEKIT_API_KEY and settings.PUBLIC_HOST:
        return f"sip:{settings.LIVEKIT_API_KEY}@{settings.PUBLIC_HOST}:5060"
    return None


@router.get("", response_model=List[PhoneNumberResponse])
async def list_numbers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(PhoneNumber).where(
                PhoneNumber.user_id == user.id,
                PhoneNumber.is_active.is_(True),
            )
        )
        return result.scalars().all()
    except ProgrammingError as e:
        msg = str(e).lower()
        if "origination_uri" in msg or "column" in msg or "does not exist" in msg:
            logger.warning("phone_numbers schema may be outdated: %s", e)
            raise HTTPException(
                status_code=503,
                detail=(
                    "Database migration required. On the server run: "
                    "cd /home/ubuntu/resona.ai && bash scripts/run-migrate-phone-numbers-docker.sh"
                ),
            ) from e
        raise


@router.get("/search")
async def search_numbers(
    country: str = Query("US"),
    area_code: Optional[str] = Query(None),
    number_type: str = Query("local"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        client = await get_twilio_client(user, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    kwargs: dict = {"limit": 20}
    if area_code:
        kwargs["area_code"] = area_code

    if number_type == "toll_free":
        available = client.available_phone_numbers(country).toll_free.list(**kwargs)
    else:
        available = client.available_phone_numbers(country).local.list(**kwargs)

    return [
        {
            "number": n.phone_number,
            "sid": n.sid,
            "friendly_name": n.friendly_name,
            "monthly_cost": 100,
            "capabilities": {"voice": n.capabilities.get("voice", False)},
        }
        for n in available
    ]


@router.post("/purchase")
async def purchase_number(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Buy a number using user's own Twilio credentials (Settings → Connect)."""
    try:
        client = await get_twilio_client(user, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    incoming = client.incoming_phone_numbers.create(
        phone_number=body["number"],
        voice_url=f"{settings.API_BASE_URL}/twilio/inbound",
        voice_method="POST",
    )

    record = PhoneNumber(
        id=uuid.uuid4(),
        user_id=user.id,
        origination_uri=_get_origination_uri(),
        number=incoming.phone_number,
        twilio_sid=incoming.sid,
        friendly_name=incoming.friendly_name,
        capabilities=incoming.capabilities or {},
        monthly_cost=100,
        purchased_at=datetime.utcnow(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.patch("/{number_id}", response_model=PhoneNumberResponse)
async def assign_agent(
    number_id: uuid.UUID,
    body: PhoneNumberAssign,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await db.get(PhoneNumber, number_id)
    if not record or record.user_id != user.id:
        raise HTTPException(status_code=404, detail="Number not found")

    # Update webhook on Twilio side too
    if record.twilio_sid:
        try:
            client = await get_twilio_client(user, db)
            client.incoming_phone_numbers(record.twilio_sid).update(
                voice_url=f"{settings.API_BASE_URL}/twilio/inbound",
                voice_method="POST",
            )
        except Exception:
            # Best-effort; still update local record
            pass

    record.agent_id = body.agent_id
    if body.use_for is not None:
        record.use_for = body.use_for if body.use_for in ("inbound", "outbound", "both") else "both"
    await db.commit()
    await db.refresh(record)
    return record


@router.post("/import")
async def import_numbers_from_twilio(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Import all phone numbers from the user's Twilio account.
    Uses credentials from Settings → Integrations (Connect).
    """
    try:
        client = await get_twilio_client(user, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Fetch all numbers from user's Twilio account
    twilio_numbers = client.incoming_phone_numbers.list()

    origination_uri = _get_origination_uri()
    imported = []
    for twilio_num in twilio_numbers:
        result = await db.execute(
            select(PhoneNumber).where(PhoneNumber.twilio_sid == twilio_num.sid)
        )
        existing = result.scalar_one_or_none()

        if not existing:
            record = PhoneNumber(
                id=uuid.uuid4(),
                user_id=user.id,
                origination_uri=origination_uri,
                number=twilio_num.phone_number,
                twilio_sid=twilio_num.sid,
                friendly_name=twilio_num.friendly_name,
                capabilities={
                    "voice": twilio_num.capabilities.get("voice", False),
                    "sms": twilio_num.capabilities.get("SMS", False),
                },
                purchased_at=datetime.utcnow(),
            )
            db.add(record)
            imported.append(twilio_num.phone_number)

    await db.commit()
    return {"imported": len(imported), "numbers": imported}


@router.delete("/{number_id}", status_code=204)
async def release_number(
    number_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await db.get(PhoneNumber, number_id)
    if not record or record.user_id != user.id:
        raise HTTPException(status_code=404, detail="Number not found")
    record.is_active = False
    await db.commit()

