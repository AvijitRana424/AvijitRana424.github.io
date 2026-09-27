"""stdout logging that reads well locally and in GitHub Actions (with ::warning:: annotations).

Privacy: the repository is public, so its Actions logs and job summaries are too. Unless detail logging is
on (``LOG_DETAILS=true``, or a local run), the scanner prints only counts and anonymised company lines;
full error text goes to the database (``companies.last_error``, ``fetch_runs.errors``), which only the
owner can read. :func:`redact` scrubs URLs, hosts, e-mail addresses and quoted values from messages
that still need to be shown, and :func:`mask` asks GitHub to hide a value from the rest of the log.
"""

from __future__ import annotations

import logging
import os
import re
import sys
import time
from typing import Iterable, Optional

log = logging.getLogger("job_radar")


class _UTCFormatter(logging.Formatter):
    converter = time.gmtime

    def formatTime(self, record, datefmt=None):  # noqa: N802 (logging API)
        return time.strftime("%H:%M:%S", self.converter(record.created))

    def format(self, record):
        record.levelshort = {"WARNING": "WARN", "CRITICAL": "CRIT"}.get(record.levelname, record.levelname)
        return super().format(record)


def setup(verbose: bool = False) -> None:
    if getattr(setup, "_done", False):
        log.setLevel(logging.DEBUG if verbose else logging.INFO)
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_UTCFormatter("%(asctime)s %(levelshort)-5s %(message)s"))
    log.addHandler(handler)
    log.setLevel(logging.DEBUG if verbose else logging.INFO)
    log.propagate = False
    # keep third-party noise down
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    setup._done = True  # type: ignore[attr-defined]


def in_github_actions() -> bool:
    return os.environ.get("GITHUB_ACTIONS") == "true"


def _escape_annotation(value: str) -> str:
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _escape_property(value: str) -> str:
    return _escape_annotation(value).replace(":", "%3A").replace(",", "%2C")


def annotate(level: str, message: str, title: str = "") -> None:
    """Emit a GitHub Actions annotation (::warning / ::error / ::notice). No-op locally."""
    if not in_github_actions():
        return
    props = f" title={_escape_property(title)}" if title else ""
    sys.stdout.write(f"::{level}{props}::{_escape_annotation(message)}\n")
    sys.stdout.flush()


def mask(values: Iterable[Optional[str]]) -> None:
    """``::add-mask::`` each non-empty value so GitHub prints *** instead. No-op locally."""
    if not in_github_actions():
        return
    for value in values:
        value = (value or "").strip()
        if len(value) >= 3 and "\n" not in value and "\r" not in value:
            sys.stdout.write(f"::add-mask::{value}\n")
    sys.stdout.flush()


_URL = re.compile(r"\b(?:https?|wss?)://\S+", re.I)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_HOST = re.compile(r"\b(?:[a-z0-9-]+\.)+(?:com|io|co|net|org|ai|dev|app|jobs|careers|in|uk|de|eu|me|so|tech|xyz|us|ca)\b(?:/[^\s:,;]*)?", re.I)
_QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"|“[^”]*”|‘[^’]*’")
_KEY_DETAIL = re.compile(r"\bKey \([^)]*\)=\([^)]*\)")
_PATH = re.compile(r"(?<![\w<>])/[^\s,;)]+")  # "url: /v1/boards/acme/jobs" (but not "URL / identifier")


def redact(message: Optional[str], limit: int = 160) -> str:
    """Strip identifying details (URLs, hosts, e-mail addresses, quoted values) from an error message."""
    text = str(message or "")
    text = _KEY_DETAIL.sub("Key (…)", text)
    text = _URL.sub("<url>", text)
    text = _EMAIL.sub("<email>", text)
    text = _HOST.sub("<host>", text)
    text = _PATH.sub("<path>", text)
    text = _QUOTED.sub("<…>", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def step_summary(markdown: str) -> None:
    """Append markdown to the GitHub Actions job summary when available."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(markdown.rstrip() + "\n")
    except OSError:
        pass
