from twilio.rest import Client

from app.config import settings


async def initiate_outbound_call(agent, user, to_number: str, call_id: str) -> str:
    """Use the user's own Twilio credentials to make the call."""

    # Use user's credentials if available, fall back to system credentials
    if getattr(user, "twilio_account_sid", None) and getattr(user, "twilio_auth_token", None):
        client = Client(user.twilio_account_sid, user.twilio_auth_token)
        from_number = getattr(user, "twilio_from_number", None) or settings.TWILIO_FROM_NUMBER
    else:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        from_number = settings.TWILIO_FROM_NUMBER

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

