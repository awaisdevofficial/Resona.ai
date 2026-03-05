from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    INTERNAL_SECRET: str

    # Twilio
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # LiveKit
    LIVEKIT_URL: str
    LIVEKIT_API_URL: str = ""  # HTTP URL for LiveKit API (SIP/twirp); e.g. https://host:7880
    LIVEKIT_API_KEY: str
    LIVEKIT_API_SECRET: str
    LIVEKIT_SIP_URI: str = ""

    # AI
    OPENAI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    DEEPGRAM_API_KEY: str
    CARTESIA_API_KEY: str = ""

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # App
    # When DEV_MODE is true, certain strict checks (like auth)
    # are relaxed to make local development easier. Do NOT enable
    # this in production environments.
    DEV_MODE: bool = True
    API_BASE_URL: str = "http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:8080"
    SECRET_KEY: str


settings = Settings()

