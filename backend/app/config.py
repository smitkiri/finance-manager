from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "finance_manager"
    db_password: str = "finance_manager_password"
    db_name: str = "finance_manager"
    port: int = 8000

    # Teller bank integration
    finance_manager_teller_integration_enabled: bool = False
    finance_manager_teller_app_id: str | None = None
    finance_manager_teller_private_key: str | None = None  # file path
    finance_manager_teller_cert: str | None = None  # file path

    # Demo mode (public hosted demo)
    finance_manager_demo_mode: bool = False
    demo_user_id: str = "demo-user"
    demo_household_id: str = "household-demo"
    demo_max_csv_bytes: int = 1_048_576  # 1 MB
    demo_max_transactions: int = 5_000
    demo_max_per_entity: int = 50

    # Households
    finance_manager_default_household_name: str = "Household"

    # Auth (A2). Default empty here for tests/imports; a startup check in
    # main.py refuses to serve if it's unset in production-ish runs.
    jwt_signing_secret: str = ""
    jwt_access_token_ttl_days: int = 30

    # Cookie-based auth. The `__Host-` prefix requires Secure + Path=/ + no
    # Domain attribute; the cookie-setter below encodes those constraints.
    auth_cookie_name: str = "__Host-fm_session"
    auth_cookie_secure: bool = True  # set to False only for local HTTP dev
    auth_cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    # CORS. When empty (the default), the API responds with the legacy
    # `Access-Control-Allow-Origin: *` (no credentials) — prod is same-origin
    # so it never engages browser CORS regardless.
    # Local dev runs the SPA on :3000 and the API behind nginx on :3002, which
    # IS cross-origin, and Phase 4's credentialed cookie auth needs an explicit
    # origin (wildcard + credentials is invalid). Set
    # `CORS_ALLOWED_ORIGINS=http://localhost:3000` in `backend/.env` to enable
    # credentialed CORS for that case. Comma-separated for multiple origins.
    cors_allowed_origins: str = ""

    @property
    def is_teller_enabled(self) -> bool:
        return (
            self.finance_manager_teller_integration_enabled
            and self.finance_manager_teller_app_id is not None
            and self.finance_manager_teller_private_key is not None
            and self.finance_manager_teller_cert is not None
        )

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
