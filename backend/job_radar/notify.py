"""Email digest of new matches: inline-styled HTML (email-client safe) + plain-text alternative.

Senders: SMTP (SSL on 465, STARTTLS on 587 — e.g. Gmail with an app password) or the Resend HTTP API.
"""

from __future__ import annotations

import hashlib
import html
import re
import smtplib
import ssl
from collections import OrderedDict
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from typing import Dict, List, Optional, Sequence, Tuple

import requests

from .models import DigestItem
from .text import parse_datetime

# palette mirrors src/styles/tokens.css (chalkboard + paper)
BOARD = "#1b1b1a"
CHALK = "#ece8df"
CHALK_DIM = "#a9a59d"
PAPER = "#f5efe6"
PAPER_2 = "#efe7db"
PAPER_LINE = "#e2d8c9"
INK = "#1f1c19"
INK_2 = "#4a443d"
INK_3 = "#7a7166"
ACCENT = "#d9503f"
STICKY = "#f8e9a6"
GREEN = "#2f7a47"
AMBER = "#9a6a00"

FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
HAND = "'Gochi Hand','Comic Sans MS','Segoe Print',cursive"


class EmailError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
#  Content
# ---------------------------------------------------------------------------

def group_by_company(items: Sequence[DigestItem]) -> "OrderedDict[str, List[DigestItem]]":
    groups: Dict[str, List[DigestItem]] = {}
    for it in items:
        groups.setdefault(it.company, []).append(it)
    for jobs in groups.values():
        jobs.sort(key=lambda j: -j.score)
    ordered = sorted(groups.items(), key=lambda kv: (-len(kv[1]), -max(j.score for j in kv[1]), kv[0].lower()))
    return OrderedDict(ordered)


def _one_line(value, limit: int = 60) -> str:
    """Scraped text for a header / preheader: no line breaks (header injection), bounded length."""
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def build_subject(items: Sequence[DigestItem]) -> str:
    n = len(items)
    names = [_one_line(c, 40) for c in group_by_company(items).keys()]
    shown = ", ".join(names[:2])
    more = "…" if len(names) > 2 else ""
    noun = "match" if n == 1 else "matches"
    return f"Job Radar: {n} new {noun} ({shown}{more})"


_SAFE_URL = re.compile(r"^https?://[^\s/]\S*$", re.I)  # the value is still HTML-escaped when used


def safe_url(value: Optional[str]) -> Optional[str]:
    """Only absolute http(s) links make it into an href (no javascript:, data: or relative URLs)."""
    url = (value or "").strip()
    return url if _SAFE_URL.match(url) else None


def _posted_label(value: Optional[str], now: datetime) -> Optional[str]:
    dt = parse_datetime(value) if value else None
    if not dt:
        return None
    days = (now.date() - dt.astimezone(timezone.utc).date()).days
    if days <= 0:
        return "posted today"
    if days == 1:
        return "posted yesterday"
    if days < 30:
        return f"posted {days}d ago"
    return f"posted {dt.strftime('%d %b')}"


def _score_colors(score: int) -> Tuple[str, str]:
    if score >= 80:
        return GREEN, "#e3f1e6"
    if score >= 65:
        return AMBER, "#fbf0cf"
    return INK_2, PAPER_2


def _e(value) -> str:
    return html.escape(str(value), quote=True)


def _job_html(job: DigestItem, now: datetime) -> str:
    fg, bg = _score_colors(job.score)
    title = _e(job.title)
    url = safe_url(job.url)
    if url:
        title = f'<a href="{_e(url)}" style="color:{INK};text-decoration:none;border-bottom:2px solid {ACCENT};">{title}</a>'
    meta = [m for m in (job.location, _posted_label(job.posted_at, now)) if m]
    meta_html = " &middot; ".join(_e(m) for m in meta)
    chips = "".join(
        f'<span style="display:inline-block;margin:4px 6px 0 0;padding:2px 8px;border-radius:10px;'
        f'background:{PAPER_2};border:1px solid {PAPER_LINE};color:{INK_2};font-size:12px;line-height:18px;">{_e(r)}</span>'
        for r in job.reasons[:6]
    )
    return f"""
          <tr>
            <td style="padding:14px 0;border-top:1px dashed {PAPER_LINE};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top" style="font-family:{FONT};">
                    <div style="font-size:16px;line-height:22px;font-weight:600;color:{INK};">{title}</div>
                    {f'<div style="font-size:13px;line-height:19px;color:{INK_3};margin-top:2px;">{meta_html}</div>' if meta_html else ''}
                    {f'<div style="margin-top:2px;">{chips}</div>' if chips else ''}
                  </td>
                  <td valign="top" align="right" width="64" style="padding-left:12px;">
                    <div style="display:inline-block;min-width:44px;text-align:center;padding:6px 8px;border-radius:8px;background:{bg};color:{fg};font-family:{FONT};font-weight:700;font-size:15px;line-height:18px;">{int(job.score)}<div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.8;">score</div></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>"""


def build_html(items: Sequence[DigestItem], tracker_url: str = "", now: Optional[datetime] = None) -> str:
    now = now or datetime.now(timezone.utc)
    groups = group_by_company(items)
    n = len(items)
    date_label = now.strftime("%a, %d %b %Y")
    sections = []
    for company, jobs in groups.items():
        rows = "".join(_job_html(j, now) for j in jobs)
        sections.append(f"""
      <tr>
        <td style="padding:0 0 18px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{PAPER};border-radius:6px;">
            <tr>
              <td style="padding:16px 20px 6px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-family:{FONT};font-size:18px;line-height:24px;font-weight:700;color:{INK};">{_e(company)}</td>
                    <td align="right" style="font-family:{FONT};font-size:12px;color:{INK_3};">{len(jobs)} new</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 6px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{rows}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>""")

    tracker_url = safe_url(tracker_url) or ""
    cta = ""
    if tracker_url:
        cta = f"""
      <tr>
        <td align="center" style="padding:6px 0 22px 0;">
          <a href="{_e(tracker_url)}" style="display:inline-block;padding:12px 22px;background:{ACCENT};color:#ffffff;font-family:{FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">Open Job Radar &rarr;</a>
        </td>
      </tr>"""

    footer_link = f' &middot; <a href="{_e(tracker_url)}" style="color:{CHALK_DIM};">tracker</a>' if tracker_url else ""
    preheader = _e(f"{n} new {'match' if n == 1 else 'matches'} — " + ", ".join(_one_line(c, 40) for c in list(groups.keys())[:4]))
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{_e(build_subject(items))}</title>
</head>
<body style="margin:0;padding:0;background:{BOARD};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{BOARD};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;">
      <tr>
        <td style="padding:0 4px 20px 4px;">
          <div style="font-family:{FONT};font-size:11px;line-height:16px;letter-spacing:.12em;text-transform:uppercase;color:{CHALK_DIM};">{_e(date_label)}</div>
          <div style="font-family:{HAND};font-size:30px;line-height:36px;color:{CHALK};">Job Radar</div>
          <div style="font-family:{FONT};font-size:14px;line-height:22px;color:{CHALK_DIM};margin-top:4px;">
            <span style="display:inline-block;padding:1px 8px;margin-right:6px;background:{STICKY};color:{INK};border-radius:3px;font-weight:700;">{n} new</span>{'match' if n == 1 else 'matches'} across {len(groups)} {'company' if len(groups) == 1 else 'companies'}
          </div>
        </td>
      </tr>{''.join(sections)}{cta}
      <tr>
        <td style="padding:4px 4px 0 4px;font-family:{FONT};font-size:12px;line-height:18px;color:{CHALK_DIM};">
          Sent by your Job Radar scanner{footer_link}. Turn the digest off under <em>Search criteria &rarr; Email</em>.
        </td>
      </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


def build_text(items: Sequence[DigestItem], tracker_url: str = "", now: Optional[datetime] = None) -> str:
    now = now or datetime.now(timezone.utc)
    tracker_url = safe_url(tracker_url) or ""
    groups = group_by_company(items)
    lines = [build_subject(items), "=" * 40, ""]
    for company, jobs in groups.items():
        lines.append(f"{company} ({len(jobs)} new)")
        lines.append("-" * min(40, len(company) + 10))
        for j in jobs:
            meta = " · ".join(m for m in (j.location, _posted_label(j.posted_at, now)) if m)
            lines.append(f"* {j.title}  [score {j.score}]")
            if meta:
                lines.append(f"  {meta}")
            if j.reasons:
                lines.append("  " + " | ".join(j.reasons))
            if safe_url(j.url):
                lines.append(f"  {safe_url(j.url)}")
        lines.append("")
    if tracker_url:
        lines.append(f"Open Job Radar: {tracker_url}")
    return "\n".join(lines).rstrip() + "\n"


def build_digest(items: Sequence[DigestItem], tracker_url: str = "", now: Optional[datetime] = None) -> Tuple[str, str, str]:
    """(subject, html, text)."""
    return build_subject(items), build_html(items, tracker_url, now), build_text(items, tracker_url, now)


# ---------------------------------------------------------------------------
#  Sending
# ---------------------------------------------------------------------------

def recipients(value: str) -> List[str]:
    out = []
    for part in (value or "").replace(";", ",").split(","):
        addr = parseaddr(part.strip())[1]
        if addr and "@" in addr and addr not in out:
            out.append(addr)
    return out


def send_smtp(settings, to: List[str], subject: str, html_body: str, text_body: str) -> None:
    if not (settings.smtp_user and settings.smtp_password):
        raise EmailError("SMTP_USER / SMTP_PASSWORD are not set")
    msg = EmailMessage()
    sender = settings.email_from or settings.smtp_user
    name, addr = parseaddr(sender)
    msg["From"] = formataddr((name or "Job Radar", addr or settings.smtp_user))
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=(addr or settings.smtp_user).split("@")[-1])
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    ctx = ssl.create_default_context()
    timeout = max(10.0, settings.request_timeout)
    try:
        if int(settings.smtp_port) == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, 465, context=ctx, timeout=timeout) as smtp:
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, int(settings.smtp_port), timeout=timeout) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ctx)
                smtp.ehlo()
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        raise EmailError("SMTP login failed — for Gmail use an App Password (Google Account → Security → App passwords)") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailError(f"SMTP send failed: {type(exc).__name__}: {exc}") from exc


def idempotency_key(items: Sequence[DigestItem]) -> str:
    """Stable key for one digest (same jobs → same key), so a retried send is not delivered twice."""
    ids = sorted(str(i.job_id or f"{i.company}|{i.title}|{i.url}") for i in items)
    return "job-radar-" + hashlib.sha256("\n".join(ids).encode("utf-8")).hexdigest()[:40]


def send_resend(settings, to: List[str], subject: str, html_body: str, text_body: str, session=None,
                key: Optional[str] = None) -> None:
    if not settings.resend_api_key:
        raise EmailError("RESEND_API_KEY is not set")
    http = session or requests
    headers = {"Authorization": f"Bearer {settings.resend_api_key}", "Content-Type": "application/json"}
    if key:
        headers["Idempotency-Key"] = key  # Resend drops a repeat of the same key for 24 h
    try:
        resp = http.post(
            "https://api.resend.com/emails",
            headers=headers,
            json={"from": settings.email_from or "Job Radar <onboarding@resend.dev>", "to": to, "subject": subject,
                  "html": html_body, "text": text_body},
            timeout=max(10.0, settings.request_timeout),
        )
    except requests.exceptions.RequestException as exc:
        raise EmailError(f"Resend request failed: {type(exc).__name__}") from exc
    if resp.status_code >= 300:
        raise EmailError(f"Resend rejected the email (HTTP {resp.status_code}): {resp.text[:200]}")


def send_digest(settings, to_value: str, items: Sequence[DigestItem], now: Optional[datetime] = None) -> bool:
    """Send the digest. Returns False when there is nothing to send or email is not configured."""
    if not items:
        return False
    to = recipients(to_value)
    if not to:
        raise EmailError("no recipient — set search_criteria.email_to or EMAIL_TO")
    subject, html_body, text_body = build_digest(items, settings.tracker_url, now)
    if settings.email_provider == "smtp":
        send_smtp(settings, to, subject, html_body, text_body)
    elif settings.email_provider == "resend":
        send_resend(settings, to, subject, html_body, text_body, key=idempotency_key(items))
    else:
        return False
    return True
