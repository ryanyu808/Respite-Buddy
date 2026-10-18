"""One deterministic reset engine shared by REST and MCP. No user state is stored."""
from datetime import datetime, timedelta, time
import json
from zoneinfo import ZoneInfo
from urllib.parse import urlencode, quote
import math
import os
import re

from ..models import Point, RouteRequest
from ..respite_models import ResetRequest, ResetResponse, Recommendation, Crowd, Exclusion
from .routing import Router
from .spot_library import load_library, demo_library, building_library

PACIFIC = ZoneInfo('America/Los_Angeles')
DEMO_TIME = datetime(2026, 10, 19, 13, 0, tzinfo=PACIFIC)
WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
SUPPORT_URL = 'https://studenthealth.usc.edu/mental-health-and-well-being/'
SUPPORT = f'Need more support? USC student counseling: {SUPPORT_URL}'


def normalize(value):
    return ' '.join(value.casefold().replace('.', '').split())


def plus_minutes(at, minutes):
    """Elapsed minutes, including across daylight-saving transitions."""
    return datetime.fromtimestamp(at.timestamp() + minutes * 60, at.tzinfo)


def crowd_for_spot(spot, demo=False):
    """Dated typical scout note, never live occupancy or a synthetic observation."""
    if not demo and spot.data_kind == 'scouted' and spot.typical_crowd and spot.verified_by and spot.verified_date:
        return Crowd(category=spot.typical_crowd, source='Verified by scouts',
                     observed_at=spot.verified_date)
    return Crowd()


def open_until(spot, at):
    """Return end of a known opening interval, including previous-day overnight hours."""
    if spot.hours is None:
        return None
    for day_offset in [-1, 0]:
        day = (at + timedelta(days=day_offset)).date()
        for interval in spot.hours.get(WEEKDAYS[day.weekday()], []):
            start = datetime.combine(day, time.fromisoformat(interval.start), PACIFIC)
            end = datetime.combine(day, time.fromisoformat(interval.end), PACIFIC)
            if end <= start:
                end += timedelta(days=1)
            if start <= at < end:
                return end
    return None


class RespiteEngine:
    def __init__(self, data, spots=None):
        self.data = data
        self.router = Router(data)
        self.library_error = None
        try:
            self.spots = load_library() if spots is None else spots
        except (OSError, ValueError):
            # A bad scouting import must not take the working routing API offline.
            self.spots = []
            self.library_error = 'The scouted spot library failed validation. Ask the team to validate the import; existing walking routes and the sample demo remain available.'

    def library(self, demo=False):
        return demo_library(self.data) if demo else self.spots

    def resolve(self, value):
        if isinstance(value, Point):
            return value
        # Explicit coordinate input uses the same Point validation as /api/routes.
        try:
            parts = value.split(',')
            if len(parts) == 2:
                return Point(lat=float(parts[0]), lon=float(parts[1]), name='Selected location')
        except ValueError:
            pass
        aliases = {'leavey': 'Leavey Library', 'lv': 'Leavey Library', 'tcc': 'Tutor Campus Center',
                   'village': 'USC Village', 'fisher': 'USC Fisher Museum'}
        target = aliases.get(normalize(value), value)
        for location in building_library(self.data):
            if normalize(target) in [normalize(location['name']), normalize(location['id']), *map(normalize, location.get('aliases', []))]:
                return Point(**{key: location[key] for key in ['lat','lon','name']})
        # Scouted building codes only resolve when all records agree on the coordinate.
        matches = [s for s in self.spots if s.verified_by and s.verified_date and normalize(value) in
                   [normalize(s.building or ''), normalize(s.building_code or '')]]
        if matches and len({(s.lat, s.lng) for s in matches}) == 1:
            return Point(lat=matches[0].lat, lon=matches[0].lng, name=matches[0].building or value)
        raise ValueError(f'Location "{value}" is not in the verified lookup. Choose a listed building or map point.')

    def details(self, spot_id, demo=False):
        match = next((s for s in self.library(demo) if s.id == spot_id), None)
        if match is None:
            raise ValueError('Spot not found. Refresh the spot library.')
        return match

    def walking_leg(self, origin, destination, preferences):
        # An exactly coincident mapped point needs no outdoor route. Distinct
        # points sharing a snapped node still go through the existing rejection.
        if origin.lat == destination.lat and origin.lon == destination.lon:
            return None
        return self.router.calculate(RouteRequest(origin=origin,destination=destination,preferences=preferences))

    def recommend(self, request: ResetRequest):
        if self.data.graph is None:
            raise ValueError('The real geographic snapshot is unavailable. Use the saved demonstration on the website.')
        at = (request.demo_time or DEMO_TIME) if request.demo else (request.now or datetime.now(PACIFIC))
        at = at.astimezone(PACIFIC)
        deadline = min([request.deadline or plus_minutes(at, request.minutes), plus_minutes(at, request.minutes)], key=lambda d: d.timestamp())
        remaining = max(0, math.floor((deadline.timestamp() - at.timestamp()) / 60))
        origin = self.resolve(request.near)
        next_class = self.resolve(request.next_class) if request.next_class is not None else None
        # Reject invalid origins even when an empty scout library would produce no results.
        self.data.nearest(origin.lat, origin.lon)
        if next_class:
            self.data.nearest(next_class.lat, next_class.lon)
        exclusions = [e for e in request.exclusions if at.timestamp() < e.until.timestamp() <= plus_minutes(at,45).timestamp()]
        excluded = {e.spot_id for e in exclusions}
        notes = ['Walking estimates exclude indoor travel, crossings and entrance offsets. Allow extra time.', SUPPORT]
        if remaining <= 0:
            notes.append('This break window has expired. Set a new available time before requesting another spot.')
        if next_class is None:
            notes.append('Rest time is provisional: no next-class location was provided, so no second walking leg is included.')
        if request.demo:
            notes.append('DEMONSTRATION: fixed time and simulated spot attributes on real OSM coordinates. No scout or live crowd observations.')
        elif self.library_error:
            notes.append(self.library_error)
        elif not self.spots:
            notes.append('No scouted locations have been imported. Add verified spots or try the clearly labeled sample demo.')
        after_dark = at.hour >= 19 or at.hour < 7
        candidates = []
        unreachable = 0
        for spot in self.library(request.demo):
            dedicated = spot.purpose != 'general' or re.search(r'\b(prayer|lactation|breastfeeding|nursing room)\b', spot.name, re.IGNORECASE)
            if spot.id in excluded or dedicated:
                continue
            if not request.demo and not (spot.data_kind == 'scouted' and spot.verified_by and spot.verified_date):
                continue
            if spot.access not in ('open','usc_id') or (spot.access == 'usc_id' and not request.usc_id):
                continue
            if after_dark and spot.safe_after_dark is not True:
                continue
            eligible = {'quiet': spot.noise == 'low', 'seated': spot.seating in ('hard','soft'),
                        'dim': spot.lighting == 'dim', 'few_people': bool(spot.verified_by and spot.verified_date and spot.typical_crowd == 'few'),
                        'indoor': spot.indoor is True, 'outdoor': spot.indoor is False}
            if any(not eligible[n] for n in request.needs):
                continue
            closing = open_until(spot, at)
            if closing is None:
                continue
            point = Point(lat=spot.lat, lon=spot.lng, name=spot.name)
            try:
                outward = self.walking_leg(origin, point, request.preferences)
                onward = self.walking_leg(point, next_class, request.preferences) if next_class else None
            except ValueError:
                # Same-node and disconnected points are not invented into zero-time routes.
                unreachable += 1
                continue
            first = next(r for r in outward.routes if r.id == outward.recommended_id) if outward else None
            second = next((r for r in onward.routes if r.id == onward.recommended_id), None) if onward else None
            # Round each leg UP, so displayed rest and leave-by never overpromise time.
            walk_to = math.ceil(first.duration_min) if first else 0
            walk_class = math.ceil(second.duration_min) if second else 0
            arrival = plus_minutes(at, walk_to)
            leave_by = min([plus_minutes(deadline, -walk_class), closing], key=lambda d: d.timestamp())
            if spot.safe_after_dark is not True:
                # Do not suggest staying after the day-to-night cutoff.
                leave_by = min([leave_by, datetime.combine(at.date(), time(19), PACIFIC)], key=lambda d: d.timestamp())
            rest = math.floor((leave_by.timestamp() - arrival.timestamp()) / 60)
            if rest <= 0:
                continue
            why = ['Fits your available time using the existing mapped walking network.']
            why += [f'Matches your {n.replace("_", " ")} preference.' for n in request.needs]
            if request.demo:
                why.append('Sample attributes are illustrative; check actual conditions before visiting.')
            crowd = crowd_for_spot(spot, request.demo)
            if crowd.category:
                why.append('Crowd category is a dated typical-condition scout note, not live occupancy.')
            # Only the two points needed to reproduce the request; no class name,
            # absolute class time, event title or complete schedule is serialized.
            query = {'to': spot.id, 'from': f'{origin.lat},{origin.lon}', 'minutes': request.minutes, 'needs': ','.join(request.needs)}
            if next_class:
                query['next'] = f'{next_class.lat},{next_class.lon}'
            if request.demo:
                query['demo'] = '1'
            base = os.getenv('WEBSITE_URL', 'https://neuro-route-nine.vercel.app').rstrip('/')
            context = {'deadline':deadline.isoformat(), 'usc_id':request.usc_id,
                       'preferences':request.preferences.model_dump()}
            if request.demo:
                context['demo_time'] = at.isoformat()
            fragment = quote(json.dumps(context,separators=(',',':')),safe='')
            candidates.append(Recommendation(spot=spot, why=why, walk_to_min=walk_to,
                walk_to_class_min=walk_class if next_class else None, rest_min=rest, leave_by=leave_by,
                tight_on_time=rest <= 3, route_to_spot=outward, route_to_class=onward,
                crowd=crowd, deep_link=f'{base}/?{urlencode(query)}#reset={fragment}'))
        candidates.sort(key=lambda r: (-r.rest_min, {'few':0,'some':1,'many':2,None:3}[r.crowd.category], r.spot.id))
        for item in candidates:
            other = next((r for r in candidates if r.spot.id != item.spot.id), None)
            item.backup_id = other.spot.id if other else None
        if unreachable:
            notes.append('Some spots could not be connected to your selected points on the current walking snapshot. No connecting path or entrance has been invented; try another supported destination.')
        if not candidates:
            notes.append('No eligible spots fit these needs, verified access/hours, safety and time constraints. Try different preferences or check the sample demo.')
        return ResetResponse(mode='demo' if request.demo else 'live', evaluated_at=at, deadline=deadline,
                             minutes=remaining, origin=origin, next_class=next_class,
                             recommendations=candidates[:3], notes=notes, exclusions=exclusions)

    def swap(self, request):
        if not request.request.demo and request.request.deadline is None:
            raise ValueError('Include the original recommendation deadline in the swap context so the available time is not restarted.')
        self.details(request.spot_id, request.request.demo)
        at = ((request.request.demo_time or DEMO_TIME) if request.request.demo else (request.request.now or datetime.now(PACIFIC))).astimezone(PACIFIC)
        exclusions = [e for e in request.request.exclusions if e.spot_id != request.spot_id and e.until > at]
        exclusions.append(Exclusion(spot_id=request.spot_id, until=plus_minutes(at,45)))
        response = self.recommend(request.request.model_copy(update={'exclusions': exclusions}))
        response.notes.insert(0, 'That spot has been set aside for 45 minutes in this session only. Here are the remaining eligible options.')
        return response

    def plan_day(self, request):
        classes = sorted(request.classes, key=lambda c: c.start)
        gaps = []
        for previous, following in zip(classes, classes[1:]):
            minutes = int((following.start - previous.end).total_seconds() // 60)
            if minutes < 1:
                continue
            reset = ResetRequest(near=previous.location, next_class=following.location,
                minutes=min(minutes,240), needs=request.needs, demo=request.demo, usc_id=request.usc_id,
                deadline=following.start,
                now=previous.end if not request.demo else None, demo_time=previous.end if request.demo else None)
            result = self.recommend(reset)
            gaps.append({'start': previous.end.isoformat(), 'end': following.start.isoformat(),
                         'recommendation': result.recommendations[0].model_dump(mode='json') if result.recommendations else None,
                         'notes': result.notes})
        return {'gaps': gaps, 'mode': 'demo' if request.demo else 'live', 'support': SUPPORT,
                'notes': ['Schedule processed for this request only; no schedule is stored.']}
