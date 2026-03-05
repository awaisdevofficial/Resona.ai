from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import (
    agents,
    api_keys,
    analytics,
    calls,
    internal_users,
    knowledge_base,
    phone_numbers,
    settings as settings_router,
    twilio_webhook,
    voices,
    webhooks,
)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    await init_db()
    yield


app = FastAPI(title="Resona.ai API", version="1.0.0", lifespan=lifespan)

# CORS configuration – FRONTEND_URL + CORS_ORIGINS (comma-separated) + dev defaults
def _cors_origins() -> list[str]:
    origins = {
        settings.FRONTEND_URL,
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }
    if settings.CORS_ORIGINS:
        for o in settings.CORS_ORIGINS.split(","):
            o = o.strip()
            if o:
                origins.add(o)
    return list(origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router, prefix="/v1/agents", tags=["Agents"])
app.include_router(calls.router, prefix="/v1/calls", tags=["Calls"])
app.include_router(
    calls.internal_router,
    prefix="/internal/calls",
    tags=["Internal"],
)
app.include_router(
    internal_users.router,
    prefix="/internal",
    tags=["Internal"],
)
app.include_router(
    phone_numbers.router,
    prefix="/v1/phone-numbers",
    tags=["Phone Numbers"],
)
app.include_router(
    settings_router.router,
    prefix="/v1/settings",
    tags=["Settings"],
)
app.include_router(voices.router, prefix="/v1/voices", tags=["Voices"])
app.include_router(twilio_webhook.router, prefix="/twilio", tags=["Twilio"])
app.include_router(analytics.router, prefix="/v1/analytics", tags=["Analytics"])
app.include_router(api_keys.router, prefix="/v1/api-keys", tags=["API Keys"])
app.include_router(webhooks.router, prefix="/v1/webhooks", tags=["Webhooks"])
app.include_router(
    knowledge_base.router,
    prefix="/v1/knowledge-base",
    tags=["Knowledge Base"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}

