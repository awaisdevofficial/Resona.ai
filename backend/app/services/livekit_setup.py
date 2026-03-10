"""
LiveKitSetupService: create/delete LiveKit SIP inbound trunk, dispatch rule,
and outbound trunk using LIVEKIT_API_URL (direct HTTP, not wss).
"""
import logging

from livekit import api
from livekit.protocol.sip import (
    CreateSIPDispatchRuleRequest,
    CreateSIPInboundTrunkRequest,
    CreateSIPOutboundTrunkRequest,
    DeleteSIPDispatchRuleRequest,
    DeleteSIPTrunkRequest,
    ListSIPInboundTrunkRequest,
    SIPDispatchRule,
    SIPDispatchRuleIndividual,
    SIPInboundTrunkInfo,
    SIPOutboundTrunkInfo,
)

from app.config import settings

logger = logging.getLogger(__name__)


def _livekit_api() -> api.LiveKitAPI:
    """LiveKit API client using LIVEKIT_API_URL (e.g. http://127.0.0.1:7880)."""
    return api.LiveKitAPI(
        url=settings.LIVEKIT_API_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    )


class LiveKitSetupService:
    def __init__(self) -> None:
        pass

    async def get_or_create_inbound_trunk(self, phone_number: str, user_id: str) -> str:
        """Reuse existing inbound trunk for this number if present, else create. Returns inbound_trunk_id."""
        lk = _livekit_api()
        try:
            existing = await lk.sip.list_sip_inbound_trunk(ListSIPInboundTrunkRequest())
            for trunk in existing.items:
                if phone_number in (trunk.numbers or []):
                    logger.info("Reusing existing LiveKit inbound trunk %s for number %s", trunk.sip_trunk_id, phone_number)
                    return trunk.sip_trunk_id
            trunk = await lk.sip.create_sip_inbound_trunk(
                CreateSIPInboundTrunkRequest(
                    trunk=SIPInboundTrunkInfo(
                        name=f"Inbound-{user_id[:8]}",
                        numbers=[phone_number],
                    )
                )
            )
            trunk_id = trunk.sip_trunk_id
            logger.info("Created LiveKit inbound trunk %s for user %s", trunk_id, user_id[:8])
            return trunk_id
        finally:
            await lk.aclose()

    async def create_inbound_trunk(self, phone_number: str, user_id: str) -> str:
        """Create inbound SIP trunk for the given number. Returns inbound_trunk_id."""
        return await self.get_or_create_inbound_trunk(phone_number, user_id)

    async def create_dispatch_rule(self, inbound_trunk_id: str, user_id: str) -> str:
        """Create dispatch rule for inbound trunk. Returns dispatch_rule_id."""
        lk = _livekit_api()
        try:
            rule = await lk.sip.create_sip_dispatch_rule(
                CreateSIPDispatchRuleRequest(
                    name=f"Dispatch-{user_id[:8]}",
                    trunk_ids=[inbound_trunk_id],
                    rule=SIPDispatchRule(
                        dispatch_rule_individual=SIPDispatchRuleIndividual(
                            room_prefix=f"call-{user_id[:8]}-",
                            pin="",
                        )
                    ),
                )
            )
            rule_id = rule.sip_dispatch_rule_id
            logger.info("Created LiveKit dispatch rule %s for user %s", rule_id, user_id[:8])
            return rule_id
        finally:
            await lk.aclose()

    async def create_outbound_trunk(
        self,
        phone_number: str,
        trunk_sid: str,
        username: str,
        password: str,
    ) -> str:
        """Create outbound SIP trunk (Twilio). Returns outbound_trunk_id."""
        lk = _livekit_api()
        try:
            # Twilio termination: {trunk_sid}.pstn.twilio.com
            address = f"{trunk_sid}.pstn.twilio.com"
            trunk = await lk.sip.create_sip_outbound_trunk(
                CreateSIPOutboundTrunkRequest(
                    trunk=SIPOutboundTrunkInfo(
                        name=f"Outbound-{phone_number}",
                        address=address,
                        numbers=[phone_number],
                        auth_username=username,
                        auth_password=password,
                    )
                )
            )
            trunk_id = trunk.sip_trunk_id
            logger.info("Created LiveKit outbound trunk %s for %s", trunk_id, phone_number)
            return trunk_id
        finally:
            await lk.aclose()

    async def delete_inbound_trunk(self, trunk_id: str) -> bool:
        try:
            lk = _livekit_api()
            try:
                await lk.sip.delete_sip_trunk(DeleteSIPTrunkRequest(sip_trunk_id=trunk_id))
                logger.info("Deleted LiveKit inbound trunk %s", trunk_id)
                return True
            finally:
                await lk.aclose()
        except Exception as e:
            logger.warning("Delete LiveKit inbound trunk %s failed: %s", trunk_id, e)
            return False

    async def delete_dispatch_rule(self, rule_id: str) -> bool:
        try:
            lk = _livekit_api()
            try:
                await lk.sip.delete_sip_dispatch_rule(
                    DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=rule_id)
                )
                logger.info("Deleted LiveKit dispatch rule %s", rule_id)
                return True
            finally:
                await lk.aclose()
        except Exception as e:
            logger.warning("Delete LiveKit dispatch rule %s failed: %s", rule_id, e)
            return False

    async def delete_outbound_trunk(self, trunk_id: str) -> bool:
        try:
            lk = _livekit_api()
            try:
                await lk.sip.delete_sip_trunk(DeleteSIPTrunkRequest(sip_trunk_id=trunk_id))
                logger.info("Deleted LiveKit outbound trunk %s", trunk_id)
                return True
            finally:
                await lk.aclose()
        except Exception as e:
            logger.warning("Delete LiveKit outbound trunk %s failed: %s", trunk_id, e)
            return False
