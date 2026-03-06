import logging
from uuid import UUID, uuid4

from livekit import api
from livekit.api import TwirpError
from livekit.protocol.sip import CreateSIPParticipantRequest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.rest import Client

from app.config import settings
from app.models.telephony import UserTelephonyConfig

logger = logging.getLogger(__name__)


async def make_outbound_call(
    user_id: str,
    to_phone_number: str,
    db: AsyncSession,
    room_name: str | None = None,
) -> dict:
    """
    Initiate outbound SIP call via LiveKit using the user's outbound trunk.
    Loads UserTelephonyConfig; returns room_name, participant_id, and status.
    """
    if not (settings.LIVEKIT_API_URL or "").strip():
        raise ValueError(
            "LiveKit API URL is not configured. Set LIVEKIT_API_URL on the server (e.g. http://127.0.0.1:7880)."
        )

    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
    result = await db.execute(
        select(UserTelephonyConfig).where(
            UserTelephonyConfig.user_id == user_uuid,
            UserTelephonyConfig.is_active.is_(True),
        )
    )
    config = result.scalar_one_or_none()
    if not config or not config.livekit_outbound_trunk_id:
        raise ValueError(
            "Telephony not configured or inactive. Connect Twilio in Settings first."
        )

    outbound_trunk_id = config.livekit_outbound_trunk_id
    if not room_name:
        room_name = f"call-{str(user_id)[:8]}-{uuid4().hex[:8]}"

    participant_identity = f"sip-{str(user_id)[:8]}"

    lk = api.LiveKitAPI(
        url=settings.LIVEKIT_API_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    )
    try:
        try:
            participant = await lk.sip.create_sip_participant(
                CreateSIPParticipantRequest(
                    sip_trunk_id=outbound_trunk_id,
                    sip_call_to=to_phone_number,
                    room_name=room_name,
                    participant_identity=participant_identity,
                    participant_name="Resona Agent",
                    krisp_enabled=True,
                    wait_until_answered=True,
                    play_dialtone=True,
                )
            )
            return {
                "room_name": room_name,
                "participant_id": participant.participant_identity,
                "call_status": "ringing",
            }
        except TwirpError as e:
            logger.exception("LiveKit create_sip_participant failed: %s", e)
            err_msg = e.message or str(e)
            meta = getattr(e, "metadata", None) or {}
            sip_status = (meta.get("sip_status") or "").lower()
            msg_lower = err_msg.lower()
            if "32100" in err_msg or "32100" in sip_status or ("trial" in msg_lower and "verified" in msg_lower):
                raise ValueError(
                    "Twilio trial accounts can only call verified numbers. "
                    "Add the destination in Twilio Console → Phone Numbers → Manage → Verified Caller IDs, or upgrade your Twilio account."
                ) from e
            raise ValueError(
                f"Call failed: {err_msg}. Check server logs for details."
            ) from e
        except Exception as e:
            logger.exception("LiveKit create_sip_participant failed: %s", e)
            err_msg = getattr(e, "message", None) or str(e)
            msg_lower = err_msg.lower()
            if "trunk" in msg_lower or "not found" in msg_lower:
                raise ValueError(
                    "Outbound trunk not found. Try disconnecting and reconnecting Twilio in Settings."
                ) from e
            if "connection" in msg_lower or "refused" in msg_lower or "unreachable" in msg_lower:
                raise ValueError(
                    "Cannot reach LiveKit. Check LIVEKIT_API_URL and that the LiveKit server (and agent worker) are running."
                ) from e
            raise ValueError(
                f"LiveKit could not start the call: {err_msg}. Check server logs for details."
            ) from e
    finally:
        await lk.aclose()


async def initiate_outbound_call(agent, user, to_number: str, call_id: str) -> str:
    """Use the user's Twilio credentials from the database to make the call."""
    account_sid = getattr(user, "twilio_account_sid", None)
    auth_token = getattr(user, "twilio_auth_token", None)
    from_number = getattr(user, "twilio_from_number", None)
    if not account_sid or not auth_token:
        raise ValueError(
            "Twilio credentials not configured. Add your Twilio Account SID and Auth Token in Settings → Phone."
        )
    if not from_number:
        raise ValueError(
            "Twilio from number not set. Configure your phone number in Settings → Phone."
        )
    client = Client(account_sid, auth_token)

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="{from_number}" timeout="90" answerOnBridge="true">
    <Sip>{settings.LIVEKIT_SIP_URI}</Sip>
  </Dial>
</Response>"""

    call = client.calls.create(
        to=to_number,
        from_=from_number,
        twiml=twiml,
        status_callback=f"{settings.API_BASE_URL}/twilio/status",
        status_callback_method="POST",
    )
    return call.sid

