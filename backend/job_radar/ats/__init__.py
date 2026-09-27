"""One module per applicant-tracking system, each exposing ``fetch(identifier, session, criteria) -> list[Posting]``.

Optional hooks a module may define:
    enrich(posting, identifier, session) -> Posting    fill description/locations for list-only APIs
    is_open(identifier, external_id, session) -> bool | None   confirm a posting missing from a partial listing
    COMPLETE_LISTING: bool                               False when fetch() is search based
    ENRICH_MULTIPLIER: int                               scales ENRICH_LIMIT for list-only APIs (default 1)
"""

from __future__ import annotations

from types import ModuleType
from typing import Dict

from . import ashby, custom, greenhouse, lever, recruitee, smartrecruiters, workable, workday
from .detect import KNOWN_ATS, detect, detect_known, identifier_for

MODULES: Dict[str, ModuleType] = {
    "greenhouse": greenhouse,
    "lever": lever,
    "ashby": ashby,
    "workday": workday,
    "smartrecruiters": smartrecruiters,
    "recruitee": recruitee,
    "workable": workable,
    "custom": custom,
}


def get_module(ats_type: str) -> ModuleType:
    try:
        return MODULES[ats_type]
    except KeyError:
        raise ValueError(f"unknown ATS type {ats_type!r}") from None


__all__ = ["MODULES", "KNOWN_ATS", "get_module", "detect", "detect_known", "identifier_for"]
