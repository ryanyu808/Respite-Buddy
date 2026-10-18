"""Shared, strict contracts for scouting imports, the website and MCP tools."""
from datetime import date, datetime
from typing import Literal
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from .models import Point, Preferences, RouteResponse

Need = Literal['quiet', 'seated', 'dim', 'few_people', 'indoor', 'outdoor']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class HoursInterval(StrictModel):
    start: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    end: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')

    @model_validator(mode='after')
    def nonempty(self):
        if self.start == self.end:
            raise ValueError('Use separate intervals for midnight; equal times are ambiguous.')
        return self


class Spot(StrictModel):
    id: str = Field(min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    name: str = Field(min_length=1, max_length=160)
    building: str | None
    building_code: str | None
    floor: str | None
    lat: float = Field(ge=34.01, le=34.032)
    lng: float = Field(ge=-118.298, le=-118.277)
    photo_url: str | None
    indoor: bool | None
    # Missing day = unknown; [] = confirmed closed. Overnight intervals allowed.
    hours: dict[Literal['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], list[HoursInterval]] | None
    access: Literal['open', 'usc_id', 'restricted'] | None
    access_note: str | None
    lighting: Literal['bright', 'medium', 'dim'] | None
    noise: Literal['low', 'medium', 'high'] | None
    seating: Literal['none', 'hard', 'soft'] | None
    typical_crowd: Literal['few', 'some', 'many'] | None
    outlets: bool | None
    food_allowed: bool | None
    restroom_nearby: bool | None
    step_free: bool | None
    safe_after_dark: bool | None
    verified_by: str | None
    verified_date: date | None
    notes: str | None
    source_url: str
    data_kind: Literal['scouted', 'mapped', 'illustrative'] = 'scouted'
    purpose: Literal['general', 'prayer', 'lactation', 'other_dedicated'] = 'general'

    @field_validator('source_url', 'photo_url')
    @classmethod
    def web_url(cls, value):
        if value is not None and not re.match(r'^https://[^\s/]+(?:/[^\s]*)?$', value):
            raise ValueError('Use a public HTTPS URL or null.')
        return value

    @model_validator(mode='after')
    def verification_pair(self):
        if bool(self.verified_by and self.verified_by.strip()) != bool(self.verified_date):
            raise ValueError('Supply both verified_by and verified_date, or neither.')
        if self.data_kind != 'scouted' and (self.verified_by or self.verified_date):
            raise ValueError('Mapped and illustrative records cannot claim scout verification.')
        if self.verified_date and self.verified_date > date.today():
            raise ValueError('Scout verification cannot be dated in the future.')
        return self


class Exclusion(StrictModel):
    spot_id: str = Field(max_length=100)
    until: datetime

    @field_validator('until')
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None:
            raise ValueError('Include a timezone offset.')
        return value


class ResetRequest(StrictModel):
    near: str | Point = 'Leavey'
    next_class: str | Point | None = None
    minutes: int = Field(default=15, ge=1, le=240)
    needs: list[Need] = Field(default_factory=list, max_length=6)
    now: datetime | None = None
    demo: bool = False
    demo_time: datetime | None = None
    deadline: datetime | None = None
    usc_id: bool = False
    preferences: Preferences = Field(default_factory=Preferences)
    exclusions: list[Exclusion] = Field(default_factory=list, max_length=100)

    @field_validator('near', 'next_class')
    @classmethod
    def bounded_location(cls, value):
        if isinstance(value, str) and not 1 <= len(value.strip()) <= 160:
            raise ValueError('Choose a supported building name/code or coordinates.')
        return value

    @field_validator('now', 'demo_time', 'deadline')
    @classmethod
    def aware(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError('Include a timezone offset.')
        return value

    @model_validator(mode='after')
    def compatible(self):
        if 'indoor' in self.needs and 'outdoor' in self.needs:
            raise ValueError('Choose indoor or outdoor, rather than both.')
        if self.demo_time and not self.demo:
            raise ValueError('A demo_time override requires demo mode.')
        return self


class Crowd(StrictModel):
    category: Literal['few', 'some', 'many'] | None = None
    source: Literal['Verified by scouts', 'Estimate', 'Reported'] | None = None
    observed_at: datetime | date | None = None


class Recommendation(StrictModel):
    spot: Spot
    why: list[str]
    walk_to_min: float
    walk_to_class_min: float | None
    rest_min: float
    leave_by: datetime
    tight_on_time: bool
    route_to_spot: RouteResponse | None
    route_to_class: RouteResponse | None
    backup_id: str | None = None
    deep_link: str
    crowd: Crowd = Field(default_factory=Crowd)


class ResetResponse(StrictModel):
    mode: Literal['live', 'demo']
    evaluated_at: datetime
    deadline: datetime
    minutes: int
    origin: Point
    next_class: Point | None
    recommendations: list[Recommendation]
    notes: list[str]
    exclusions: list[Exclusion]


class SwapRequest(StrictModel):
    request: ResetRequest
    spot_id: str = Field(min_length=1, max_length=100)
    reason: Literal['full', 'locked', 'another'] = 'another'


class ClassEntry(StrictModel):
    location: str | Point
    start: datetime
    end: datetime

    @model_validator(mode='after')
    def ordered(self):
        if self.start.tzinfo is None or self.end.tzinfo is None or self.end <= self.start:
            raise ValueError('Classes need timezone-aware start/end times with end after start.')
        return self


class PlanDayRequest(StrictModel):
    classes: list[ClassEntry] = Field(min_length=1, max_length=20)
    needs: list[Need] = Field(default_factory=list, max_length=6)
    demo: bool = False
    usc_id: bool = False

    @model_validator(mode='after')
    def no_overlap(self):
        ordered = sorted(self.classes, key=lambda c: c.start)
        if any(b.start < a.end for a, b in zip(ordered, ordered[1:])):
            raise ValueError('Class times overlap. Review the extracted schedule.')
        return self
