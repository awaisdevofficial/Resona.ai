"""
TwilioSetupService: create/delete Elastic SIP Trunk, origination URI,
credential list, and associate phone number for a user's Twilio account.
All operations use the user's own account_sid and auth_token (sync Twilio SDK
run in executor).
"""
import asyncio
import logging
import secrets
import string
from uuid import uuid4

from twilio.rest import Client

logger = logging.getLogger(__name__)


def _make_twilio_password() -> str:
    """Generate a password that meets Twilio rules: min 12 chars, 1 digit, mixed case."""
    guaranteed = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice(string.digits),
    ]
    rest = [secrets.choice(string.ascii_letters + string.digits) for _ in range(10)]
    combined = guaranteed + rest
    secrets.SystemRandom().shuffle(combined)
    return "".join(combined)


class TwilioSetupService:
    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        phone_number: str,
        sip_server_ip: str,
    ):
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.phone_number = phone_number
        self.sip_server_ip = sip_server_ip
        self._client = Client(account_sid, auth_token)

    def _setup_trunk_sync(self) -> dict:
        """Synchronous trunk setup (run in executor)."""
        friendly_name = f"Resona-{self.phone_number}"
        cred_list_name = f"Resona-Creds-{self.phone_number}"

        # 1. Create Elastic SIP Trunk
        trunk = self._client.trunking.v1.trunks.create(friendly_name=friendly_name)
        trunk_sid = trunk.sid
        logger.info("Created Twilio trunk %s", trunk_sid)

        try:
            # 2. Add Origination URI
            sip_url = f"sip:{self.sip_server_ip}:5060"
            self._client.trunking.v1.trunks(trunk_sid).origination_urls.create(
                weight=1,
                priority=1,
                enabled=True,
                friendly_name="Resona-Origination",
                sip_url=sip_url,
            )
            logger.info("Added origination URI %s to trunk %s", sip_url, trunk_sid)

            # 3. Create Credential List (account-level SIP)
            cred_list = self._client.api.accounts(self.account_sid).sip.credential_lists.create(
                friendly_name=cred_list_name
            )
            credential_list_sid = cred_list.sid

            sip_username = f"resona_{uuid4().hex[:8]}"
            sip_password = _make_twilio_password()
            self._client.api.accounts(self.account_sid).sip.credential_lists(
                credential_list_sid
            ).credentials.create(username=sip_username, password=sip_password)
            logger.info("Created credential list %s with credential", credential_list_sid)

            # 4. Attach credential list to trunk (termination auth)
            self._client.trunking.v1.trunks(trunk_sid).termination.credential_list_mappings.create(
                credential_list_sid=credential_list_sid
            )
            logger.info("Attached credential list to trunk %s", trunk_sid)

            # 5. Associate phone number with trunk: get IncomingPhoneNumber SID then add to trunk
            incoming = self._client.api.accounts(self.account_sid).incoming_phone_numbers.list(
                phone_number=self.phone_number
            )
            if not incoming:
                raise ValueError(
                    f"Phone number {self.phone_number} not found in this Twilio account. "
                    "Purchase or port the number first."
                )
            phone_number_sid = incoming[0].sid
            self._client.trunking.v1.trunks(trunk_sid).phone_numbers.create(
                phone_number_sid=phone_number_sid
            )
            logger.info("Associated phone number %s with trunk %s", self.phone_number, trunk_sid)

            return {
                "trunk_sid": trunk_sid,
                "sip_username": sip_username,
                "sip_password": sip_password,
            }
        except Exception:
            # Best-effort cleanup on failure
            try:
                self._client.trunking.v1.trunks(trunk_sid).delete()
            except Exception as e:
                logger.warning("Cleanup delete trunk failed: %s", e)
            raise

    async def setup_trunk(self) -> dict:
        """Create trunk, origination, credential list, attach to trunk, associate number."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._setup_trunk_sync)

    def _delete_trunk_sync(self, trunk_sid: str) -> bool:
        """Delete trunk (removes origination URLs and phone number associations; credential lists stay on account)."""
        try:
            self._client.trunking.v1.trunks(trunk_sid).delete()
            logger.info("Deleted Twilio trunk %s", trunk_sid)
            return True
        except Exception as e:
            logger.warning("Delete trunk %s failed: %s", trunk_sid, e)
            return False

    async def delete_trunk(self, trunk_sid: str) -> bool:
        """Delete the Elastic SIP trunk."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._delete_trunk_sync, trunk_sid)
