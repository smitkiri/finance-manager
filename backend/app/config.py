from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "expense_tracker"
    db_password: str = "expense_tracker_password"
    db_name: str = "expense_tracker"
    api_secret: str | None = None
    port: int = 8000

    # Teller bank integration
    finance_manager_teller_integration_enabled: bool = False
    finance_manager_teller_app_id: str | None = None
    finance_manager_teller_private_key: str | None = None  # file path
    finance_manager_teller_cert: str | None = None  # file path

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

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
