from datetime import datetime, timezone

import pytest

from job_radar import notify
from job_radar.config import Settings
from job_radar.models import DigestItem

NOW = datetime(2026, 9, 27, 3, 30, tzinfo=timezone.utc)


def items():
    return [
        DigestItem("Stripe", "Software Engineer, Data Pipeline", "https://stripe.com/jobs/search?gh_jid=1&x=<y>",
                   "Bangalore", 67, ["title ≈ Software Engineer", "7+ yrs (above range)", "📍 Bengaluru"],
                   "2026-09-21T11:18:26+00:00", "j1"),
        DigestItem("Walmart", "Senior Backend Engineer", "https://walmart.example/j/2", "Bengaluru, India", 91,
                   ["title ≈ Backend Engineer", "level: senior", "+java +kafka"], "2026-09-27T01:00:00+00:00", "j2"),
        DigestItem("Walmart", "SDE II <script>alert(1)</script>", None, None, 58, [], None, "j3"),
        DigestItem("Notion", "Software Engineer, Infrastructure", "https://jobs.ashbyhq.com/notion/1", "Hyderabad, India",
                   83, ["title ≈ Software Engineer"], "2026-08-06T20:17:46+00:00", "j4"),
    ]


def test_subject_lists_top_companies():
    assert notify.build_subject(items()) == "Job Radar: 4 new matches (Walmart, Notion…)"
    assert notify.build_subject(items()[:1]) == "Job Radar: 1 new match (Stripe)"
    assert notify.build_subject(items()[:2]) == "Job Radar: 2 new matches (Walmart, Stripe)"


def test_grouping_orders_companies_and_jobs():
    groups = notify.group_by_company(items())
    assert list(groups) == ["Walmart", "Notion", "Stripe"]
    assert [j.score for j in groups["Walmart"]] == [91, 58]


def test_html_digest_content_and_escaping():
    subject, html, text = notify.build_digest(items(), "https://avijit.dev/tracker/", NOW)
    assert subject.startswith("Job Radar: 4 new matches")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert 'href="https://stripe.com/jobs/search?gh_jid=1&amp;x=&lt;y&gt;"' in html
    assert "Open Job Radar" in html and 'href="https://avijit.dev/tracker/"' in html
    for piece in ("Walmart", "Senior Backend Engineer", "Bengaluru, India", "+java +kafka", "posted today", "posted 6d ago"):
        assert piece in html
    # inline styles only (email clients strip <style> blocks)
    assert "<style" not in html and "style=" in html
    assert "4 new" in html and "3 companies" in html


def test_text_alternative():
    _s, _h, text = notify.build_digest(items(), "https://avijit.dev/tracker/", NOW)
    assert "Walmart (2 new)" in text
    assert "* Senior Backend Engineer  [score 91]" in text
    assert "title ≈ Backend Engineer | level: senior | +java +kafka" in text
    assert text.rstrip().endswith("Open Job Radar: https://avijit.dev/tracker/")


def test_recipients_parsing():
    assert notify.recipients("a@x.com, Bob <b@y.com>; a@x.com") == ["a@x.com", "b@y.com"]
    assert notify.recipients("") == []


def _settings(**kw):
    base = dict(email_provider="smtp", smtp_user="me@gmail.com", smtp_password="app-pass", email_from="Job Radar <me@gmail.com>",
                smtp_host="smtp.gmail.com", smtp_port=465, site_url="https://avijit.dev/")
    base.update(kw)
    return Settings(**base)


class FakeSMTP:
    sent = []
    instances = []

    def __init__(self, host, port, context=None, timeout=None):
        self.host, self.port, self.tls = host, port, False
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def ehlo(self):
        pass

    def starttls(self, context=None):
        self.tls = True

    def login(self, user, password):
        self.login_as = (user, password)

    def send_message(self, msg):
        FakeSMTP.sent.append(msg)


def test_send_digest_via_smtp_ssl(monkeypatch):
    FakeSMTP.sent, FakeSMTP.instances = [], []
    monkeypatch.setattr(notify.smtplib, "SMTP_SSL", FakeSMTP)
    assert notify.send_digest(_settings(), "you@example.com", items(), NOW) is True
    msg = FakeSMTP.sent[0]
    assert msg["To"] == "you@example.com" and msg["Subject"].startswith("Job Radar: 4 new matches")
    assert msg.get_body(("plain",)) is not None and msg.get_body(("html",)) is not None
    assert "https://avijit.dev/tracker/" in msg.get_body(("html",)).get_content()
    assert FakeSMTP.instances[0].login_as == ("me@gmail.com", "app-pass")


def test_send_digest_via_starttls(monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(notify.smtplib, "SMTP", FakeSMTP)
    notify.send_digest(_settings(smtp_port=587), "you@example.com", items(), NOW)
    assert FakeSMTP.instances[0].tls is True and FakeSMTP.instances[0].port == 587


def test_send_digest_via_resend(monkeypatch):
    calls = []

    class Resp:
        status_code = 200
        text = "{}"

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append((url, headers, json))
        return Resp()

    monkeypatch.setattr(notify.requests, "post", fake_post)
    s = _settings(email_provider="resend", resend_api_key="re_123", email_from="Job Radar <radar@avijit.dev>")
    assert notify.send_digest(s, "you@example.com", items(), NOW) is True
    url, headers, body = calls[0]
    assert url == "https://api.resend.com/emails" and headers["Authorization"] == "Bearer re_123"
    assert body["to"] == ["you@example.com"] and body["from"] == "Job Radar <radar@avijit.dev>"
    assert body["html"].startswith("<!doctype html>") and body["text"]


def test_send_digest_skips_when_empty_or_unconfigured():
    assert notify.send_digest(_settings(), "you@example.com", [], NOW) is False
    assert notify.send_digest(_settings(email_provider="none"), "you@example.com", items(), NOW) is False
    with pytest.raises(notify.EmailError, match="recipient"):
        notify.send_digest(_settings(), "", items(), NOW)


def test_scraped_links_and_headers_are_sanitised():
    evil = [
        DigestItem("Evil\r\nBcc: victim@example.com", "Engineer <img src=x onerror=alert(1)>", "javascript:alert(1)",
                   "<b>Pune</b>", 70, ['"><script>x</script>'], None, "e1"),
        DigestItem("Ok Co", "Backend Engineer", "  https://ok.example/jobs/1  ", None, 60, [], None, "e2"),
        DigestItem("Ok Co", "Data Engineer", "/relative/path", None, 55, [], None, "e3"),
    ]
    subject, html, text = notify.build_digest(evil, "javascript:alert(2)", NOW)
    assert "\n" not in subject and "\r" not in subject and subject.count("Bcc:") <= 1
    assert "javascript:" not in html and "/relative/path" not in html
    assert "<img" not in html and "<script>" not in html and "<b>Pune</b>" not in html
    assert 'href="https://ok.example/jobs/1"' in html
    assert "Open Job Radar" not in html  # unsafe tracker URL → no button
    assert "javascript:" not in text and "https://ok.example/jobs/1" in text
    assert notify.safe_url("http://a.example/x") == "http://a.example/x"
    assert notify.safe_url("data:text/html,hi") is None and notify.safe_url(None) is None


def test_smtp_send_survives_newlines_in_company_names(monkeypatch):
    FakeSMTP.sent, FakeSMTP.instances = [], []
    monkeypatch.setattr(notify.smtplib, "SMTP_SSL", FakeSMTP)
    odd = [DigestItem("Acme\nInjected: yes", "Software Engineer", "https://acme.example/1", None, 60, [], None, "j9")]
    assert notify.send_digest(_settings(), "you@example.com", odd, NOW) is True
    assert FakeSMTP.sent[0]["Injected"] is None and "\n" not in FakeSMTP.sent[0]["Subject"]


def test_resend_gets_a_stable_idempotency_key(monkeypatch):
    keys = []

    class Resp:
        status_code = 200
        text = "{}"

    def fake_post(url, headers=None, json=None, timeout=None):
        keys.append(headers.get("Idempotency-Key"))
        return Resp()

    monkeypatch.setattr(notify.requests, "post", fake_post)
    s = _settings(email_provider="resend", resend_api_key="re_123")
    notify.send_digest(s, "you@example.com", items(), NOW)
    notify.send_digest(s, "you@example.com", list(reversed(items())), NOW)  # same jobs, other order
    notify.send_digest(s, "you@example.com", items()[:2], NOW)
    assert keys[0] and keys[0] == keys[1] != keys[2]
    assert keys[0] == notify.idempotency_key(items()) and len(keys[0]) <= 64
