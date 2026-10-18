"""Provisional indoor exploration, strictly separate from scout recommendations."""
import json
import math
import os
from urllib.parse import quote, urlencode
from ..models import Point
from ..respite_models import Recommendation
from .campus_directory import candidates
from .spot_filters import known, matches


def indoor_options(engine, request, at, deadline, origin, next_class, excluded):
    from .respite import plus_minutes
    wanted = {'quiet': ('noise', 'low'), 'seated': ('seating', ('hard', 'soft')),
              'dim': ('lighting', 'dim'), 'few_people': ('typical_crowd', 'few'),
              'indoor': ('indoor', True), 'outdoor': ('indoor', False)}
    found = []
    legs = {}
    for spot in candidates():
        if spot.id in excluded or spot.indoor is not True or spot.purpose != 'general' or spot.reservation_required is True or spot.access == 'restricted':
            continue
        if spot.access == 'usc_id' and not request.usc_id:
            continue
        if any(not known(spot, wanted[need][0]) or
               (getattr(spot, wanted[need][0]) not in wanted[need][1] if isinstance(wanted[need][1], tuple)
                else getattr(spot, wanted[need][0]) != wanted[need][1]) for need in request.needs):
            continue
        if 'few_people' in request.needs:  # A dated student description isn't a scout occupancy report.
            continue
        if not matches(spot, request.filters.model_copy(update={'max_walk_min': None}), at):
            continue
        point = Point(lat=spot.lat, lon=spot.lng, name=spot.name)
        key = (spot.lat, spot.lng)
        if key not in legs:
            try:
                legs[key] = (engine.walking_leg(origin, point, request.preferences),
                             engine.walking_leg(point, next_class, request.preferences) if next_class else None)
            except ValueError:
                legs[key] = None  # Never invent a path for a disconnected or unsupported anchor.
        if legs[key] is None:
            continue
        outward, onward = legs[key]
        walk = math.ceil(next(r.duration_min for r in outward.routes if r.id == outward.recommended_id)) if outward else 0
        walk_class = math.ceil(next(r.duration_min for r in onward.routes if r.id == onward.recommended_id)) if onward else 0
        if request.filters.max_walk_min is not None and walk > request.filters.max_walk_min:
            continue
        leave_by = plus_minutes(deadline, -walk_class)
        rest = math.floor((leave_by.timestamp() - plus_minutes(at, walk).timestamp()) / 60)
        if rest <= 0:
            continue
        query = {'to': spot.id, 'from': f'{origin.lat},{origin.lon}', 'minutes': request.minutes, 'needs': ','.join(request.needs)}
        if next_class:
            query['next'] = f'{next_class.lat},{next_class.lon}'
        context = {'deadline': deadline.isoformat(), 'usc_id': request.usc_id,
                   'preferences': request.preferences.model_dump(), 'filters': request.filters.model_dump(mode='json')}
        link = os.getenv('WEBSITE_URL', 'https://neuro-route-nine.vercel.app').rstrip('/') + '/?' + urlencode(query) + '#reset=' + quote(json.dumps(context, separators=(',', ':')), safe='')
        found.append(Recommendation(spot=spot, walk_to_min=walk,
            walk_to_class_min=walk_class if next_class else None, rest_min=rest,
            leave_by=leave_by, tight_on_time=rest <= 3, route_to_spot=outward,
            route_to_class=onward, deep_link=link,
            why=['Documented indoor place, not a scout-verified recommendation.',
                 'Check current opening and entry before visiting. Rest time assumes access; indoor travel is excluded.']))
    found.sort(key=lambda r: (-r.rest_min, r.spot.id))
    # Different buildings make useful backups, not three names for one room area.
    options, anchors = [], set()
    for option in found:
        anchor = (option.spot.lat, option.spot.lng)
        if anchor not in anchors:
            options.append(option)
            anchors.add(anchor)
        if len(options) == 3:
            break
    for option in options:
        option.backup_id = next((r.spot.id for r in options if r.spot.id != option.spot.id), None)
    return options
