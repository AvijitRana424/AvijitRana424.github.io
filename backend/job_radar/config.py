"""Runtime settings, read from environment variables (and backend/.env when present)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, MutableMapping, Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ENV_FILE = BACKEND_DIR / ".env"

_TRUE = {"1", "true", "yes", "y", "on"}
_FALSE = {"0", "false", "no", "n", "off", ""}


def parse_env_file(text: str) -> dict:
    """Tiny .env parser: KEY=VALUE lines, '#' comments, optional 'export ', optional quotes."""
    out = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            quote = value[0]
            value = value[1:-1]
            if quote == '"':
                value = value.replace("\\n", "\n")
        else:
            # strip inline comments (" # ...") on unquoted values
            hash_at = value.find(" #")
            if hash_at >= 0:
                value = value[:hash_at].rstrip()
        out[key] = value
    return out


def load_env_file(path: Path = DEFAULT_ENV_FILE, environ: Optional[MutableMapping[str, str]] = None) -> int:
    """Load KEY=VALUE pairs into the environment without overriding variables already set.

    Returns the number of variables applied (0 when the file does not exist)."""
    env = os.environ if environ is None else environ
    try:
        text = Path(path).read_text(encoding="utf-8")
    except (FileNotFoundError, IsADirectoryError, PermissionError):
        return 0
    applied = 0
    for key, value in parse_env_file(text).items():
        if key not in env or env.get(key, "") == "":
            env[key] = value
            applied += 1
    return applied


def _bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    v = value.strip().lower()
    if v in _TRUE:
        return True
    if v in _FALSE:
        return False
    return default


def _int(value: Optional[str], default: int, lo: int = 1, hi: int = 10_000) -> int:
    try:
        n = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _float(value: Optional[str], default: float) -> float:
    try:
        n = float(str(value).strip())
    except (TypeError, ValueError):
        return default
    return n if n > 0 else default


def _str(env: Mapping[str, str], key: str, default: str = "") -> str:
    return (env.get(key) or default).strip()


@dataclass
class Settings:
    supabase_url: str = ""
    supabase_key: str = ""
    email_provider: str = "none"  # resolved: smtp | resend | none
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    resend_api_key: str = ""
    email_from: str = ""
    email_to: str = ""
    site_url: str = ""
    run_trigger: str = "local"  # schedule | manual | local
    dry_run: bool = False
    max_workers: int = 6
    request_timeout: float = 20.0
    enrich_limit: int = 40  # max detail fetches per company (for list APIs without descriptions)
    company_budget: float = 240.0  # seconds one company may take before the scanner gives up on it
    run_budget: float = 780.0  # seconds after which companies not started yet are skipped (job timeout is 25 min)
    #: print company names, job titles, criteria and recipients. Off in GitHub Actions (public logs)
    #: unless LOG_DETAILS=true; on for local runs.
    log_details: bool = False

    # ------------------------------------------------------------------
    @classmethod
    def from_env(cls, environ: Optional[Mapping[str, str]] = None, env_file: Optional[Path] = DEFAULT_ENV_FILE) -> "Settings":
        if environ is None:
            if env_file is not None:
                load_env_file(env_file)
            environ = os.environ
        env = environ

        smtp_user = _str(env, "SMTP_USER")
        smtp_password = _str(env, "SMTP_PASSWORD").replace(" ", "")  # Gmail shows app passwords in groups of 4
        resend_key = _str(env, "RESEND_API_KEY")

        provider = _str(env, "EMAIL_PROVIDER").lower()
        if provider not in ("smtp", "resend", "none"):
            if resend_key:
                provider = "resend"
            elif smtp_user and smtp_password:
                provider = "smtp"
            else:
                provider = "none"

        trigger = _str(env, "RUN_TRIGGER", "local").lower()
        if trigger not in ("schedule", "manual", "local"):
            trigger = "local"

        in_ci = env.get("GITHUB_ACTIONS") == "true"
        raw_details = (env.get("LOG_DETAILS") or "").strip()  # empty (an unset repo variable) = default
        log_details = _bool(raw_details or None, trigger == "local" and not in_ci)

        email_from = _str(env, "EMAIL_FROM")
        if not email_from:
            if provider == "smtp" and smtp_user:
                email_from = f"Job Radar <{smtp_user}>"
            elif provider == "resend":
                email_from = "Job Radar <onboarding@resend.dev>"

        return cls(
            supabase_url=_str(env, "SUPABASE_URL").rstrip("/"),
            supabase_key=_str(env, "SUPABASE_SERVICE_ROLE_KEY"),
            email_provider=provider,
            smtp_host=_str(env, "SMTP_HOST", "smtp.gmail.com"),
            smtp_port=_int(env.get("SMTP_PORT"), 465, 1, 65535),
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            resend_api_key=resend_key,
            email_from=email_from,
            email_to=_str(env, "EMAIL_TO"),
            site_url=_str(env, "SITE_URL"),
            run_trigger=trigger,
            dry_run=_bool(env.get("DRY_RUN"), False),
            max_workers=_int(env.get("MAX_WORKERS"), 6, 1, 32),
            request_timeout=_float(env.get("REQUEST_TIMEOUT"), 20.0),
            enrich_limit=_int(env.get("ENRICH_LIMIT"), 40, 0, 500),
            company_budget=float(_int(env.get("COMPANY_TIME_BUDGET"), 240, 10, 3600)),
            run_budget=float(_int(env.get("RUN_TIME_BUDGET"), 780, 30, 6 * 3600)),
            log_details=log_details,
        )

    # ------------------------------------------------------------------
    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)

    @property
    def tracker_url(self) -> str:
        """Link to the tracker page. SITE_URL may be the site root or the tracker itself."""
        url = self.site_url.strip()
        if not url:
            return ""
        if url.rstrip("/").endswith("/tracker"):
            return url.rstrip("/") + "/"
        return url.rstrip("/") + "/tracker/"

    def redacted(self, details: Optional[bool] = None) -> dict:
        """Settings summary that is safe to print in CI logs.

        Secrets are never shown. Addresses and the project URL only appear with ``details``
        (default: ``log_details``), because GitHub Actions logs of a public repository are public."""
        details = self.log_details if details is None else details

        def shown(value: str, empty: str) -> str:
            if not value:
                return empty
            return value if details else "set"

        return {
            "supabase": shown(self.supabase_url, "(not set)"),
            "service_key": "set" if self.supabase_key else "(not set)",
            "email_provider": self.email_provider,
            "email_from": shown(self.email_from, "(default)"),
            "email_to": shown(self.email_to, "(from criteria)"),
            "site_url": self.tracker_url or "(not set)",
            "trigger": self.run_trigger,
            "dry_run": self.dry_run,
            "max_workers": self.max_workers,
            "request_timeout": self.request_timeout,
            "enrich_limit": self.enrich_limit,
            "log_details": details,
        }
