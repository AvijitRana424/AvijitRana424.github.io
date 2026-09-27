"""The GitHub Actions workflow forwards every setting the scanner reads and keeps the schedule alive."""

import re
from pathlib import Path

import pytest

WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "job-fetch.yml"
CONFIG = Path(__file__).resolve().parents[1] / "job_radar" / "config.py"


def _text() -> str:
    if not WORKFLOW.exists():  # pragma: no cover - backend copied without the repo
        pytest.skip("workflow file not present")
    return WORKFLOW.read_text(encoding="utf-8")


def test_every_env_setting_is_forwarded():
    read = set(re.findall(r'env(?:\.get)?\(\s*"([A-Z_]+)"|_str\(env, "([A-Z_]+)"', CONFIG.read_text()) )
    names = {a or b for a, b in read} - {"GITHUB_ACTIONS"}
    assert {"SMTP_HOST", "SMTP_PORT", "MAX_WORKERS", "REQUEST_TIMEOUT", "ENRICH_LIMIT", "LOG_DETAILS"} <= names
    text = _text()
    missing = [n for n in sorted(names) if not re.search(rf"^\s+{n}: \$\{{\{{", text, re.M)]
    assert missing == []


def test_keepalive_reenables_the_workflow():
    text = _text()
    assert "actions/workflows/job-fetch.yml/enable" in text and "actions: write" in text
    assert "timeout-minutes: 25" in text


def test_workflow_yaml_parses():
    yaml = pytest.importorskip("yaml")
    data = yaml.safe_load(_text())
    assert data["permissions"] == {"contents": "read"}  # the scan job keeps a read-only token
    keep = data["jobs"]["keepalive"]
    assert keep["permissions"] == {"actions": "write"} and "schedule" in keep["if"]
