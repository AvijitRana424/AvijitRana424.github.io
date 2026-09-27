from job_radar.config import Settings, load_env_file, parse_env_file


def test_parse_env_file():
    text = """
# comment
SUPABASE_URL=https://x.supabase.co/
export SMTP_USER="me@gmail.com"
SMTP_PASSWORD='abcd efgh ijkl mnop'
EMAIL_TO=me@gmail.com # inline comment
EMPTY=
BROKEN LINE
"""
    env = parse_env_file(text)
    assert env["SUPABASE_URL"] == "https://x.supabase.co/"
    assert env["SMTP_USER"] == "me@gmail.com"
    assert env["SMTP_PASSWORD"] == "abcd efgh ijkl mnop"
    assert env["EMAIL_TO"] == "me@gmail.com"
    assert env["EMPTY"] == ""
    assert "BROKEN LINE" not in env


def test_load_env_file_does_not_override(tmp_path):
    f = tmp_path / ".env"
    f.write_text("A=from-file\nB=from-file\n")
    env = {"A": "already-set"}
    assert load_env_file(f, env) == 1
    assert env == {"A": "already-set", "B": "from-file"}
    assert load_env_file(tmp_path / "missing.env", env) == 0


def test_settings_defaults_and_provider_autodetect():
    s = Settings.from_env({})
    assert s.email_provider == "none" and s.smtp_host == "smtp.gmail.com" and s.smtp_port == 465
    assert s.max_workers == 6 and s.run_trigger == "local" and s.dry_run is False and not s.has_supabase

    s = Settings.from_env({"SMTP_USER": "me@gmail.com", "SMTP_PASSWORD": "abcd efgh ijkl mnop"})
    assert s.email_provider == "smtp" and s.smtp_password == "abcdefghijklmnop"
    assert s.email_from == "Job Radar <me@gmail.com>"

    s = Settings.from_env({"RESEND_API_KEY": "re_1", "SMTP_USER": "me@gmail.com", "SMTP_PASSWORD": "x"})
    assert s.email_provider == "resend" and "resend.dev" in s.email_from

    s = Settings.from_env({"EMAIL_PROVIDER": "none", "RESEND_API_KEY": "re_1"})
    assert s.email_provider == "none"


def test_settings_parsing_is_forgiving():
    s = Settings.from_env({"MAX_WORKERS": "abc", "REQUEST_TIMEOUT": "-3", "DRY_RUN": "yes", "RUN_TRIGGER": "cron",
                           "SMTP_PORT": "587", "SUPABASE_URL": "https://p.supabase.co/", "SUPABASE_SERVICE_ROLE_KEY": "k"})
    assert s.max_workers == 6 and s.request_timeout == 20.0 and s.dry_run is True and s.run_trigger == "local"
    assert s.smtp_port == 587 and s.supabase_url == "https://p.supabase.co" and s.has_supabase


def test_tracker_url():
    assert Settings(site_url="https://me.github.io/Portfolio").tracker_url == "https://me.github.io/Portfolio/tracker/"
    assert Settings(site_url="https://me.github.io/Portfolio/tracker").tracker_url == "https://me.github.io/Portfolio/tracker/"
    assert Settings(site_url="").tracker_url == ""
    assert "service_key" in Settings(supabase_key="secret").redacted()
    assert "secret" not in str(Settings(supabase_key="secret", smtp_password="pw").redacted())
