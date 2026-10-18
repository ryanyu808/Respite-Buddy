import json
import sys
from pathlib import Path
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app
from app.respite_models import PlanDayRequest, ResetRequest
from app.services.campus_directory import candidates, CampusCandidate, Evidence
from app.services.geographic_data import MapData
from app.services.respite import RespiteEngine


def test_directory_provenance_and_safety_separation():
    values = candidates()
    assert len(values) >= 30
    assert len({p.id for p in values}) == len(values)
    for p in values:
        assert p.data_kind == 'mapped' and p.verified_by is None and p.verified_date is None
        assert p.hours is None and p.noise is None and p.typical_crowd is None
        assert p.safe_after_dark is None and p.step_free is None and p.access is None
        assert p.provenance and p.anchor_source.startswith('https://')
        assert 'anchor' in p.routing_anchor
    assert all(p.reservation_required for p in values if 'pod' in p.id)
    engine = RespiteEngine(MapData(), values)
    assert engine.recommend(ResetRequest(now='2026-10-19T13:00:00-07:00')).recommendations == []


def test_candidate_cannot_claim_scout_or_invalid_position():
    raw=candidates()[0].model_dump(mode='json')
    for changes in [{'verified_by':'Research','verified_date':'2026-10-17'},{'lat':0},{'data_kind':'scouted'}]:
        with pytest.raises(ValidationError): CampusCandidate.model_validate({**raw,**changes})
    with pytest.raises(ValidationError): Evidence(url='https://example.com',source_type='USC primary source',checked='2026-10-17',supports=['name'])


def normalized(**patch):
    return {**dict(id='local',source='ics',title='',start='2026-10-19T12:00:00-07:00',end='2026-10-19T13:00:00-07:00',location='Leavey',category='class'),**patch}


def test_normalized_calendar_compatibility_and_shared_engine():
    events=[normalized(),{**normalized(),'id':'next','start':'2026-10-19T13:15:00-07:00','end':'2026-10-19T14:00:00-07:00','location':'TCC'}]
    model=PlanDayRequest(events=events,demo=True)
    engine=RespiteEngine(MapData())
    actual=engine.plan_day(model)
    legacy=engine.plan_day(PlanDayRequest(classes=[dict(location=e['location'],start=e['start'],end=e['end']) for e in events],demo=True))
    assert actual == legacy
    assert actual['gaps'][0]['recommendations']
    assert actual['gaps'][0]['reset_request']['deadline'] == events[1]['start']
    assert actual['gaps'][0]['recommendation']['route_to_class']
    assert 'title' not in json.dumps(actual)


@pytest.mark.parametrize('events',[
    [normalized(category='unclassified')],
    [{**normalized(),'start':'2026-10-19T12:00:00'}],
    [{**normalized(),'time_zone':'Fictional/Zone'}],
    [normalized(),{**normalized(),'id':'overlap'}],
])
def test_invalid_calendars_rejected(events):
    with pytest.raises(ValidationError): PlanDayRequest(events=events)


def test_new_directory_and_legacy_health_endpoints():
    with TestClient(app) as client:
        assert client.get('/api/health').json()['graph_loaded'] is True
        assert client.get('/api/spots').json() == []
        response=client.get('/api/campus-candidates')
        assert response.status_code == 200
        assert response.json()[0]['data_kind'] == 'mapped'
