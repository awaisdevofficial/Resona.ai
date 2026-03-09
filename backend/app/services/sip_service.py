from livekit import api
from livekit.protocol.sip import (
    CreateSIPInboundTrunkRequest,
    CreateSIPOutboundTrunkRequest,
    CreateSIPDispatchRuleRequest,
    DeleteSIPDispatchRuleRequest,
    DeleteSIPTrunkRequest,
    ListSIPInboundTrunkRequest,
    SIPDispatchRule,
    SIPDispatchRuleDirect,
    SIPInboundTrunkInfo,
    SIPOutboundTrunkInfo,
)

from app.config import settings


async def setup_user_sip(
    user_id: str,
    phone_number: str,
    termination_uri: str,
    sip_username: str,
    sip_password: str,
) -> dict:
    """
    Register a user's SIP trunk in LiveKit.

    Creates inbound trunk, outbound trunk, and a dispatch rule that routes
    inbound calls to rooms with the prefix `sip-{user_id}-`.

    Returns a dict containing trunk IDs and dispatch rule ID.
    """
    lk = api.LiveKitAPI(
        url=settings.LIVEKIT_API_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    )

    try:
        # Delete any existing inbound trunks with conflicting numbers
        try:
            existing = await lk.sip.list_sip_inbound_trunk(
                ListSIPInboundTrunkRequest()
            )
            for trunk in existing.items:
                if phone_number in trunk.numbers:
                    await lk.sip.delete_sip_trunk(
                        DeleteSIPTrunkRequest(sip_trunk_id=trunk.sip_trunk_id)
                    )
        except Exception as e:
            print(f"Cleanup warning: {e}")

        # 1. Create Inbound SIP Trunk
        inbound_trunk = await lk.sip.create_sip_inbound_trunk(
            CreateSIPInboundTrunkRequest(
                trunk=SIPInboundTrunkInfo(
                    name=f"resona-inbound-{user_id}",
                    numbers=[phone_number],
                    allowed_addresses=[
                        "54.172.60.0/23",
                        "54.244.51.0/24",
                        "54.171.127.192/26",
                        "35.156.191.128/25",
                        "54.65.63.192/26",
                        "54.169.127.128/26",
                        "54.252.254.64/26",
                        "177.71.206.192/26",
                    ],
                )
            )
        )
        print("inbound_trunk response:", inbound_trunk, dir(inbound_trunk))

        # 2. Create Outbound SIP Trunk
        outbound_trunk = await lk.sip.create_sip_outbound_trunk(
            CreateSIPOutboundTrunkRequest(
                trunk=SIPOutboundTrunkInfo(
                    name=f"resona-outbound-{user_id}",
                    address=termination_uri,
                    numbers=[phone_number],
                    auth_username=sip_username,
                    auth_password=sip_password,
                )
            )
        )

        # 3. Create Dispatch Rule (routes inbound calls to agent worker)
        dispatch_rule = await lk.sip.create_sip_dispatch_rule(
            CreateSIPDispatchRuleRequest(
                rule=SIPDispatchRule(
                    dispatch_rule_direct=SIPDispatchRuleDirect(
                        room_name=f"sip-{user_id}-",
                        pin="",
                    )
                ),
                trunk_ids=[inbound_trunk.sip_trunk_id],
                name=f"resona-dispatch-{user_id}",
                metadata=f'{{"user_id": "{user_id}"}}',
            )
        )

        return {
            "inbound_trunk_id": inbound_trunk.sip_trunk_id,
            "outbound_trunk_id": outbound_trunk.sip_trunk_id,
            "dispatch_rule_id": dispatch_rule.sip_dispatch_rule_id,
        }

    finally:
        await lk.aclose()


async def delete_user_sip(
    inbound_trunk_id: str | None,
    outbound_trunk_id: str | None,
    dispatch_rule_id: str | None,
) -> None:
    """Remove all SIP resources for a user from LiveKit."""
    lk = api.LiveKitAPI(
        url=settings.LIVEKIT_API_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    )
    try:
        if dispatch_rule_id:
            await lk.sip.delete_sip_dispatch_rule(
                DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=dispatch_rule_id)
            )
        if inbound_trunk_id:
            await lk.sip.delete_sip_trunk(
                DeleteSIPTrunkRequest(sip_trunk_id=inbound_trunk_id)
            )
        if outbound_trunk_id:
            await lk.sip.delete_sip_trunk(
                DeleteSIPTrunkRequest(sip_trunk_id=outbound_trunk_id)
            )
    finally:
        await lk.aclose()


async def make_outbound_sip_call(
    outbound_trunk_id: str,
    to_number: str,
    room_name: str,
    participant_identity: str = "sip-caller",
) -> str:
    """
    Initiate outbound SIP call via LiveKit.

    Returns the SIP participant identity for the created call.
    """
    from livekit.protocol.sip import CreateSIPParticipantRequest

    lk = api.LiveKitAPI(
        url=settings.LIVEKIT_API_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    )
    try:
        result = await lk.sip.create_sip_participant(
            CreateSIPParticipantRequest(
                sip_trunk_id=outbound_trunk_id,
                sip_call_to=to_number,
                room_name=room_name,
                participant_identity=participant_identity,
                participant_name="Caller",
            )
        )
        return result.participant_identity
    finally:
        await lk.aclose()

