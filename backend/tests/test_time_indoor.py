import json
import sys
from pathlib import Path
from datetime import timedelta
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.respite_models import ResetRequest, SpotFilters, SwapRequest
from app.services.respite import RespiteEngine, DEMO_TIME
from app.services.geographic_data import MapData
from app.services.campus_directory import candidates

@pytest.fixture(scope='module')
def engine():
    return RespiteEngine(MapData())

@pytest.mark.parametrize('minutes', [15, 30, 45, 60])
def test_indoor_demo_uses_real_anchors_at_every_interval(engine, minutes):
    result = engine.recommend(ResetRequest(demo=True, minutes=minutes, needs=['indoor'], next_class='TCC'))
    assert len(result.recommendations) == 3
    assert any('Leavey' in item.spot.name for item in result.recommendations)
    for item in result.recommendations:
        assert item.spot.indoor is True and item.spot.data_kind == 'illustrative'
        assert item.spot.verified_by is None and item.crowd.category is None
        assert item.rest_min == minutes - item.walk_to_min - item.walk_to_class_min
        assert item.route_to_class

def test_live_indoor_options_are_separate_provisional_and_strict(engine):
    request = ResetRequest(now=DEMO_TIME, minutes=30, needs=['indoor'], next_class='TCC')
    result = engine.recommend(request)
    assert result.recommendations == []
    assert len(result.documented_options) >= 2
    assert any(item.spot.building == 'Leavey Library' for item in result.documented_options)
    for item in result.documented_options:
        assert item.spot.data_kind == 'mapped' and item.spot.verified_by is None
        assert item.spot.indoor and item.spot.hours is None
        assert item.rest_min == 30 - item.walk_to_min - item.walk_to_class_min
        assert any('assumes access' in why for why in item.why)
        assert item.crowd.category is None
    for filters in [SpotFilters(indoor=True, verified_only=True), SpotFilters(indoor=True, open_now=True), SpotFilters(indoor=True, step_free=True)]:
        assert not engine.recommend(request.model_copy(update={'filters': filters})).documented_options

def test_documented_swap_retains_original_budget(engine):
    request = ResetRequest(now=DEMO_TIME, minutes=30, filters=SpotFilters(indoor=True), next_class='TCC')
    original = engine.recommend(request)
    item = original.documented_options[0]
    swapped = engine.swap(SwapRequest(spot_id=item.spot.id, reason='full', request=request.model_copy(update={'deadline': original.deadline, 'now': DEMO_TIME + timedelta(minutes=5)})))
    assert swapped.deadline == original.deadline and swapped.minutes == 25
    assert all(r.spot.id != item.spot.id for r in swapped.documented_options)


@pytest.mark.parametrize('configured', [None, 'https://preview.example/'])
def test_recommendation_links_use_canonical_site_and_preserve_overrides(engine, monkeypatch, configured):
    from urllib.parse import urlparse, parse_qs
    if configured is None:
        monkeypatch.delenv('WEBSITE_URL', raising=False)
    else:
        monkeypatch.setenv('WEBSITE_URL', configured)
    expected = configured.rstrip('/') if configured else 'https://respite-buddy.vercel.app'
    for demo in [False, True]:
        request = ResetRequest(minutes=30, needs=['indoor'], next_class='TCC',
                               **({'demo': True} if demo else {'now': DEMO_TIME}))
        result = engine.recommend(request)
        items = result.recommendations if demo else result.documented_options
        assert items
        for item in items:
            assert item.deep_link.startswith(expected + '/?')
            link = urlparse(item.deep_link)
            assert parse_qs(link.query)['to'] == [item.spot.id]
            assert 'next' in parse_qs(link.query)
            assert link.fragment.startswith('reset=')

def test_submitted_research_is_deduplicated_and_never_claims_scout_data():
    root = Path(__file__).resolve().parents[2]
    raw = json.loads((root / 'backend/data/campus-submitted.json').read_text(encoding='utf-8'))
    assert raw == json.loads((root / 'frontend/src/data/campus-submitted.json').read_text(encoding='utf-8'))
    assert len(raw['spots']) == 46
    assert len({p['id'] for p in raw['spots']}) == 46
    ids = {p.id for p in candidates()}
    for spot in raw['spots']:
        assert set(spot['existing_ids']) <= ids
        assert not any(key in spot for key in ['lat', 'lng', 'verified_by', 'hours', 'noise', 'typical_crowd'])
    assert {'dml-hall-honor', 'dml-treasure'} <= ids
