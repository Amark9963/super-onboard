from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://onboard:local-only@localhost:5432/onboard"
    ai_provider: str = "mock"
    # Optional live provider (OpenAI-compatible chat completions). Opt-in: unusable without a key.
    ai_api_key: str | None = None
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: int = 60
    ai_batch_chars: int = 12000
    extraction_stale_minutes: int = 10
    app_origin: str = "http://localhost:3000"
    cookie_secure: bool = False
    session_hours: int = 8
    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "onboard-private"
    s3_access_key: str = "onboard-local"
    s3_secret_key: str = "local-storage-only"
    max_upload_bytes: int = 10 * 1024 * 1024
    parse_timeout_seconds: int = 45


settings = Settings()
