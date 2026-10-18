"""Strict, evidence-aware matching. Unknown is never a confirmed match."""
from datetime import datetime
from ..respite_models import SpotFilters


def scouted(spot):
    return bool(spot.data_kind == 'scouted' and spot.verified_by and spot.verified_date)


def known(spot, field):
    if getattr(spot, field, None) is None:
        return False
    # A signed scout record covers its populated fields. Online documentation
    # needs attribute-specific evidence, never an inference from a venue name.
    return bool(scouted(spot) or (spot.evidence or {}).get(field) or any(
        field in p.supports and p.source_type != 'USC historical article'
        for p in getattr(spot, 'provenance', [])))


def matches(spot, filters: SpotFilters, at: datetime, walk_min=None):
    from .respite import open_until
    def positive(field, expected=True):
        return known(spot, field) and getattr(spot, field) == expected
    checks = {
        'quiet': positive('noise', 'low'),
        'outlets': positive('outlets'),
        'comfortable_seating': positive('seating', 'soft'),
        'few_people': scouted(spot) and positive('typical_crowd', 'few'),
        'dim': positive('lighting', 'dim'),
        'indoor': positive('indoor'), 'outdoor': positive('indoor', False),
        'restroom': positive('restroom_nearby'), 'food_allowed': positive('food_allowed'),
        'food_available': positive('food_available'), 'step_free': positive('step_free'),
        'open_now': known(spot, 'hours') and open_until(spot, at) is not None,
        'no_reservation': positive('reservation_required', False),
        'verified_only': scouted(spot),
        'evening_access': positive('safe_after_dark') and known(spot, 'hours') and open_until(spot, at) is not None and known(spot,'access') and spot.access in ('open','usc_id'),
    }
    if any(getattr(filters,key) and not match for key,match in checks.items()):
        return False
    if filters.access != 'any' and not positive('access', filters.access):
        return False
    if filters.activity == 'charge' and not positive('outlets'):
        return False
    if filters.activity == 'eat' and not (positive('food_available') or positive('food_allowed')):
        return False
    if filters.max_walk_min is not None and (walk_min is None or walk_min > filters.max_walk_min):
        return False
    return True


def activity_priority(spot, activity):
    # Only a tie-breaker after the engine's existing rest-time ordering.
    if activity == 'study':
        return int(known(spot,'noise') and spot.noise == 'low') + int(any('study' in a.lower() for a in getattr(spot,'amenities',[])))
    return 0
