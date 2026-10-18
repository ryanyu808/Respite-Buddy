"""Reproducible curation, NOT a geocoder or a scout-data generator.

Sources reviewed 2026-10-17. Unknown conditions intentionally remain null.
Run from backend: python scripts/prepare_campus_directory.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.respite_models import Spot
from app.services.campus_directory import CampusCandidate

CHECKED = '2026-10-17'
LV = 'https://libraries.usc.edu/locations/leavey-library/leavey-library-spaces'
LV1 = 'https://libraries.usc.edu/locations/leavey-library/rooms/leavey-1st-floor'
LV3 = 'https://libraries.usc.edu/locations/leavey-library/rooms/leavey-library-third-floor'
SPACES = 'https://libraries.usc.edu/spaces-overview'
DML = 'https://libraries.usc.edu/locations/doheny-memorial-library/doheny-memorial-library-spaces'
DMLPAGE = 'https://libraries.usc.edu/locations/doheny-memorial-library'
CIN = 'https://libraries.usc.edu/locations/cinematic-arts-library/cinematic-arts-library-spaces'
K = 'https://kortschakcenter.usc.edu/our-space/'

# Coordinates explicitly published as Place GeoCoordinates in USC Event Calendar
# JSON-LD, or already in the committed OSM snapshot. They are not room locations.
ANCHORS = {
 'LVL': ('Leavey Library', 34.0217845, -118.28294018728783, 'https://www.openstreetmap.org/way/406923908'),
 'DML': ('Doheny Memorial Library', 34.020197, -118.283725, 'https://calendar.usc.edu/doheny_memorial_library_dml'),
 'STU': ('Student Union', 34.02023, -118.28575, 'https://calendar.usc.edu/student_union_stu'),
 'THH': ('Taper Hall', 34.021726, -118.284382, 'https://calendar.usc.edu/taper_hall_thh'),
 'RGL': ('Lewis Hall', 34.019242, -118.282883, 'https://calendar.usc.edu/lewis_hall_rgl'),
}
result = []


def add(id, name, code, floor, source, amenities=(), reserve=None, indoor=True, historic=False):
    building, lat, lng, anchor = ANCHORS[code]
    raw = {key: None for key in Spot.model_fields}
    raw.update(id=id, name=name, building=building, building_code=code, floor=floor,
        lat=lat, lng=lng, indoor=indoor, source_url=source, data_kind='mapped', purpose='general',
        notes='Existence documented; current conditions, access and hours require confirmation.',
        access_note='Reservation required; availability not checked.' if reserve else 'Student eligibility and current entry rules unconfirmed.',
        provenance=[dict(url=source, source_type='USC historical article' if historic else 'USC primary source',
            checked=CHECKED, supports=['name', 'building', 'indoor', *(['floor'] if floor else []), *amenities])],
        routing_anchor='Approximate building routing anchor, not the room, entrance or an indoor path.',
        anchor_source=anchor, amenities=list(amenities), reservation_required=reserve)
    result.append(CampusCandidate.model_validate(raw).model_dump(mode='json'))


for id, name, floor, source, amenities in [
 ('weingart','Weingart Reading Room','1',LV,['Desks and tables']),
 ('popular','Popular Reading Room','1',LV,['Reading collection']),
 ('av','Audio/Visual Room','1',LV,['Viewing stations']),
 ('suite113','Suite 113 Study Space','1',LV1,['Study seats']),
 ('east1','First-floor East Wing study area','1',LV1,['Individual desks']),
 ('ahmanson','Ahmanson Information Commons','Ground',SPACES,['Computing space']),
 ('study2','Second-floor study area','2',SPACES,['Study area']),
 ('east3','Third-floor East Wing quiet study area','3',LV3,['Designated quiet study (not a noise measurement)']),
 ('west3','Third-floor West Wing collaborative area','3',LV3,['Collaborative study']),
]: add('lvl-'+id,name,'LVL',floor,source,amenities)
add('lvl-terrace','Leavey outdoor terrace','LVL',None,LV,['Outdoor study area'],indoor=False)
for pod in ['210A','210B','210C','310A','310B','310C']:
    add('lvl-pod-'+pod.lower(),'Study Pod '+pod,'LVL',pod[0],LV,['Reservable pod'],True)
for id,name,floor,source,amenities,reserve in [
 ('times','Los Angeles Times Reference Room','1', 'https://libraries.usc.edu/locations/doheny-memorial-library/rooms/los-angeles-times-reference-room',['Study tables'],None),
 ('east-asian','East Asian Library','1',DML,['Library study area'],None),
 ('stacks','Bookstack study desks',None,DML,['Study desks'],None),
 ('collaborative','Collaborative workrooms',None,DML,['Group study'],True),
 ('music','Music Library','Ground',DMLPAGE,['Library study area'],None),
 ('arts-corridor','Arts Corridor study area','Ground',DMLPAGE,['Study area'],None),
 ('cin-reading','Cinematic Arts Library Reading Room','Ground',CIN,['Reading area'],None),
 ('cin-study','Cinematic Arts Library Study Space','Ground',CIN,['Study area'],None),
]: add('dml-'+id,name,'DML',floor,source,amenities,reserve)
for id,name in [('quiet','Quiet Study Room'),('dynamic','Dynamic Study Space'),('creativity','Creativity Corner')]:
    add('kortschak-'+id,name,'STU','3 / Suite 311',K, ['Center study space'],historic=True)
CHAN='https://chan.usc.edu/people/student-blog/makayla/my-hidden-gem-study-and-rest-spaces'
add('thh-lounge4','Taper Hall fourth-floor lounge','THH','4',CHAN,['Department lounge'],historic=True)
add('rgl-lounge1','Price School first-floor student lounge','RGL','1',CHAN,['Student lounge'],historic=True)

# Real mapped spaces. No seating, opening times or live crowd claims inferred.
snapshot = json.loads((ROOT/'data/snapshot/locations.json').read_text())
for name in ['Alumni Park','McCarthy Quad','Exposition Park Rose Garden']:
    p = next(p for p in snapshot if p['name'] == name)
    raw = {key: None for key in Spot.model_fields}
    raw.update(id='mapped-'+p['id'],name=name,lat=p['lat'],lng=p['lon'],indoor=False,
        source_url=p['osm_url'],data_kind='mapped',purpose='general',
        provenance=[dict(url=p['osm_url'],source_type='OpenStreetMap snapshot',checked=CHECKED,supports=['name','lat','lng','indoor'])],
        routing_anchor='Mapped outdoor feature anchor, not a verified entrance or seat.', anchor_source=p['osm_url'],
        amenities=[],reservation_required=None,notes='Mapped potential location; all access and sensory conditions unconfirmed.')
    result.append(CampusCandidate.model_validate(raw).model_dump(mode='json'))

if __name__ == '__main__':
    encoded = json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    (ROOT/'data/campus-candidates.json').write_text(encoded,encoding='utf-8')
    (ROOT.parent/'frontend/src/data/campus-candidates.json').write_text(encoded,encoding='utf-8')
    (ROOT/'data/campus-candidate.schema.json').write_text(json.dumps(CampusCandidate.model_json_schema(),indent=2)+'\n')
    buildings = [dict(id='usc-'+code.lower(),name=name,lat=lat,lon=lng,aliases=[code],source_url=url,source_checked=CHECKED,
                     notes='USC-published building coordinate, not an entrance or room.')
                 for code,(name,lat,lng,url) in ANCHORS.items() if code!='LVL']
    (ROOT/'data/campus-buildings.json').write_text(json.dumps(buildings,indent=2)+'\n')
    print(f'{len(result)} exploration candidates; zero scout verifications added.')
