"""
Deal Flow Agent — Configuration
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ──────────────────────────────────────────────────────────────────
    APP_NAME: str = "Deal Flow Agent"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/dealflow"

    # ── AI Models ────────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    # Primary model for agents (Claude Sonnet is a good balance of speed/quality)
    AI_MODEL: str = "claude-3-5-sonnet-20241022"
    AI_PROVIDER: str = "anthropic"  # "anthropic" | "openai"

    # ── External APIs ─────────────────────────────────────────────────────────
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    CRUNCHBASE_API_KEY: str = ""

    # ── Embeddings ───────────────────────────────────────────────────────────
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536

    # ── Agent config ─────────────────────────────────────────────────────────
    MAX_TOKENS: int = 4096
    TEMPERATURE: float = 0.2  # Low temp for analytical tasks


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
