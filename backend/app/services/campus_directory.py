"""Exploration-only records. Never mixed into RespiteEngine's scout library."""
import json
from datetime import date
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from pydantic import Field, field_validator
from ..respite_models import Spot, StrictModel


class Evidence(StrictModel):
    url: str
    source_type: Literal['USC primary source', 'USC historical article', 'OpenStreetMap snapshot']
    checked: date
    supports: list[str] = Field(min_length=1)

    @field_validator('url')
    @classmethod
    def official_url(cls, value):
        host = urlparse(value).hostname or ''
        if not value.startswith('https://') or not (host.endswith('.usc.edu') or host == 'usc.edu' or host == 'www.openstreetmap.org'):
            raise ValueError('Evidence must cite USC or the source OSM feature.')
        return value


class CampusCandidate(Spot):
    # An extension of the existing schema, not a replacement for scout imports.
    data_kind: Literal['mapped'] = 'mapped'
    provenance: list[Evidence] = Field(min_length=1)
    routing_anchor: str
    anchor_source: str
    amenities: list[str]
    reservation_required: bool | None


FILE = Path(__file__).resolve().parents[2] / 'data' / 'campus-candidates.json'


def candidates():
    values = [CampusCandidate.model_validate(v) for v in json.loads(FILE.read_text(encoding='utf-8'))]
    if len({v.id for v in values}) != len(values):
        raise ValueError('Duplicate campus candidate IDs')
    return values
