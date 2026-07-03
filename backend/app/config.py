from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração da aplicação, lida de variáveis de ambiente."""

    # Conexão async com o Postgres (driver asyncpg).
    database_url: str = "postgresql+asyncpg://music:music@postgres:5432/music"

    # Diretório dentro do container onde os .rar enviados ficam armazenados.
    # Mapeado para um volume do host no docker-compose.
    data_dir: str = "/data/rars"

    # Diretório dos avatares de perfil (em disco, no volume).
    avatar_dir: str = "/data/avatars"

    # Origens permitidas no CORS (lista separada por vírgula).
    cors_origins: str = "http://localhost:3000"

    # Tamanho máximo de um único arquivo de upload, em bytes (default 5 GiB).
    max_upload_bytes: int = 5 * 1024 * 1024 * 1024

    # Modo debug: quando False, /docs e /redoc ficam desativados.
    debug: bool = False
    # Cookie de sessão Secure (só HTTPS). Deixe true em produção (Cloudflare = HTTPS).
    cookie_secure: bool = True

    # ----- Autenticação / usuários -----
    # Valor sentinela: se permanecer este, o app recusa subir em produção.
    jwt_secret: str = "CHANGE_ME"
    jwt_expire_hours: int = 24 * 7  # 7 dias

    # Super admin (criado no startup se não existir).
    admin_email: str = "admin@toqueagora.local"
    admin_password: str = "admin123"

    # Quotas em GB.
    default_quota_gb: float = 5.0
    admin_quota_gb: float = 20.0

    # WhatsApp do admin para upgrade de quota (DDI+DDD+número, só dígitos).
    admin_whatsapp: str = ""

    # ----- Pagamentos (Asaas) -----
    asaas_api_key: str = ""
    asaas_base_url: str = "https://sandbox.asaas.com/api/v3"
    # Segredo que validamos no header do webhook (configurado no painel Asaas).
    asaas_webhook_token: str = ""
    # Auto-cadastro público (vitrine). Desligue para travar o registro.
    public_signup_enabled: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def default_quota_bytes(self) -> int:
        return int(self.default_quota_gb * 1024 * 1024 * 1024)

    @property
    def admin_quota_bytes(self) -> int:
        return int(self.admin_quota_gb * 1024 * 1024 * 1024)

    @property
    def jwt_secret_is_insecure(self) -> bool:
        return self.jwt_secret in ("CHANGE_ME", "troque-este-segredo-em-producao", "")

    @property
    def admin_password_is_insecure(self) -> bool:
        """Senha do super admin fraca/default — proibida em produção.

        Cobre os defaults conhecidos, valores óbvios e senhas curtas demais.
        A conta admin vê tudo (usuários, pagamentos), então é o alvo nº 1.
        """
        pw = self.admin_password or ""
        weak_defaults = {
            "admin123",
            "admin",
            "troque-esta-senha",
            "troque-esta-senha-forte",
            "changeme",
            "password",
            "senha123",
        }
        return pw.lower() in weak_defaults or len(pw) < 10


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
