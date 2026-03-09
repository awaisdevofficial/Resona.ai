from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from urllib.parse import urlparse


def _strip_trailing_slash(v: str) -> str:
    """Ensure URL has no trailing slash to avoid double slashes when concatenating."""
    return v.rstrip("/") if isinstance(v, str) and v else v


def _livekit_api_url_from_ws_url(ws_url: str) -> str:
    """Derive HTTP API URL from LIVEKIT_URL (wss://host/path -> https://host)."""
    if not (ws_url or "").strip():
        return ""
    parsed = urlparse(ws_url)
    scheme = "https" if parsed.scheme == "wss" else "http"
    return f"{scheme}://{parsed.netloc}"


def _env_files() -> list[str]:
    """Load .env.production first when ENV=production, else .env. Missing files are skipped (env vars still apply)."""
    import os
    if os.environ.get("ENV") == "production":
        return [".env.production", ".env"]
    return [".env"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files(),
        extra="ignore",
        env_file_encoding="utf-8",
    )

    # Database
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    INTERNAL_SECRET: str

    # Twilio: credentials come from database (user settings), not .env

    # LiveKit
    LIVEKIT_URL: str
    LIVEKIT_API_URL: str = ""  # HTTP URL for LiveKit API (SIP/twirp). If empty or localhost, derived from LIVEKIT_URL.
    LIVEKIT_API_KEY: str
    LIVEKIT_API_SECRET: str
    LIVEKIT_SIP_URI: str = ""
    # SIP origination: IP where Twilio sends inbound SIP (e.g. 18.141.140.150)
    SIP_SERVER_IP: str = "127.0.0.1"

    # AI: Groq (LLM); self-hosted Piper (TTS) and Whisper.cpp (STT) only
    GROQ_API_KEY: str = ""
    PIPER_TTS_URL: str = ""
    PIPER_TTS_VOICE: str = "en_US-amy-medium"
    PIPER_TTS_MODEL: str = "tts-1"
    WHISPER_STT_URL: str = ""
    WHISPER_STT_MODEL: str = "whisper-1"
    WHISPER_STT_LANGUAGE: str = "en"

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # App / URLs
    # When DEV_MODE is true, certain strict checks (like auth)
    # are relaxed to make local development easier. Do NOT enable
    # this in production environments.
    DEV_MODE: bool = True
    # Public base URL of this API (no trailing slash). Used for Twilio webhooks, callbacks, agent worker.
    # Local: http://localhost:8000  |  Production: https://your-domain.com or https://your-domain.com/api
    API_BASE_URL: str = "http://localhost:8000"
    # Public URL of the frontend app. Used for CORS and links.
    FRONTEND_URL: str = "http://localhost:3000"
    # Hostname for SIP/origination display (e.g. your-domain.com). No scheme, no port.
    PUBLIC_HOST: str = "localhost"
    # Extra CORS origins, comma-separated (e.g. https://app.example.com).
    CORS_ORIGINS: str = ""

    SECRET_KEY: str

    # Agent prompt limits (keep JWT token URL safe; ~2k–8k URL limit in browsers)
    MAX_SYSTEM_PROMPT_LEN: int = 8000
    MAX_FIRST_MESSAGE_LEN: int = 500
    MAX_KNOWLEDGE_BASE_LEN_FOR_TOKEN: int = 4000

    @field_validator("API_BASE_URL", "FRONTEND_URL", mode="after")
    @classmethod
    def normalize_url(cls, v: str) -> str:
        return _strip_trailing_slash(v)

    @model_validator(mode="after")
    def set_livekit_api_url_from_ws(self):
        """When LIVEKIT_API_URL is empty or points to localhost, derive from LIVEKIT_URL so worker/backend use the same server."""
        api_url = (self.LIVEKIT_API_URL or "").strip()
        if not api_url or "localhost" in api_url or "127.0.0.1" in api_url:
            derived = _livekit_api_url_from_ws_url(self.LIVEKIT_URL or "")
            if derived:
                object.__setattr__(self, "LIVEKIT_API_URL", derived)
        return self


settings = Settings()

