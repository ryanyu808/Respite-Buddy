# Scout and import real respite spots

The production library is `backend/data/respite-spots.json`. It is intentionally empty until the team submits real scout records. OpenStreetMap rest stops remain map context; they do not establish quietness, access, seating availability, hours or accessibility. The separate sample demo uses three real OSM positions with explicitly simulated attributes.

1. Copy `backend/data/respite-spots.scouting-template.json` to a new file within the repository (for example `tmp/ryan-scouts.json`). Duplicate the record per space. Coordinate placeholders are `null`: they must be replaced before import. Never import the blank template as a real spot.
2. Give every spot a stable unique `id`. Enter the exact name, building/code, floor and a verified latitude/longitude within the current USC coverage. Include a public HTTPS source URL; retain photo permission and avoid identifiable people in photos. Unknown fields stay `null`, not false or guessed values.
3. Record `verified_by` and `verified_date` together only after actual scouting. These fields mean a dated visit, not live conditions. Record access restrictions and intended use. Prayer, lactation and other dedicated-use spaces are excluded from general recommendations.
4. Use `hours` as an object keyed `mon` through `sun`. Each value is a list of `{ "start": "09:00", "end": "17:00" }` intervals in Los Angeles local time. Missing day means unknown; `[]` means confirmed closed. Overnight intervals such as `22:00`–`02:00` are supported. Confirm changes for holidays manually; regular hours do not establish holiday access. Document exceptions in notes and remove eligibility when uncertain.
5. Validate before proposing a data PR:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe scripts/validate_spots.py ../tmp/ryan-scouts.json
```

On macOS/Linux: `../.venv/bin/python scripts/validate_spots.py ../tmp/ryan-scouts.json`.

6. Combine reviewed records into `backend/data/respite-spots.json` using normal edits. The validator does not overwrite files. Re-run validation and backend tests, commit to your own feature branch, and request human review. Restart/redeploy the backend after importing. No application rewrite is required.

`respite-spots.schema.json` is generated from the Pydantic contract used at runtime; regenerate with `python scripts/validate_spots.py --schema` when that contract changes. Imports reject duplicate IDs, omitted required fields, invalid enums, unsupported coordinates, partial verification and non-HTTPS URLs. Warnings identify unknown access/hours and dedicated-use spaces.

Allowed values:

| Field | Values (or null) |
| --- | --- |
| access | open, usc_id, restricted |
| lighting | bright, medium, dim |
| noise | low, medium, high |
| seating | none, hard, soft |
| typical_crowd | few, some, many |
| indoor, outlets, food_allowed, restroom_nearby, step_free, safe_after_dark | true, false, null |

`step_free` and `safe_after_dark` must reflect actual verification, not an inference from a map or photo. Unknown after-dark safety excludes a spot between 19:00 and 07:00, and prevents recommending a stay past 19:00. Unknown hours/access also exclude a live recommendation. USC-ID access requires the user to explicitly indicate eligibility. No field implies a verified step-free walking route: the underlying outdoor graph lacks that guarantee.

The `typical_crowd` field, when accompanied by real scout verification, is a dated typical-condition note, never a current occupancy count. Its source and date are shown. No camera/sensor data or class-change crowd estimate is implemented.

The separate `backend/data/respite-spots.illustrative-example.json` demonstrates a complete valid record shape at the real OSM Alumni Park position, with unknown conditions and no verification. It is excluded from live recommendations. For the runnable sample demo, `demo-way-154906676` uses that same position but sample hours 07:00–19:00, low noise and seating are synthetic inputs used only in demo mode. They must never be copied into the scouted library. The programmatic examples live in `backend/app/services/spot_library.py` and are labeled `data_kind: illustrative` with no scout identity or verification date.

Building names/codes resolve from the committed mapped presets, cited campus building data, or unambiguous scouted building records. Leavey/LV and TCC work now. JKP coordinates were retrieved from the [official USC Event Calendar](https://calendar.usc.edu/popovich_hall_jkp) Place GeoCoordinates and are stored in `backend/data/buildings.json`. That building point currently snaps to a disconnected component of the snapshot: lookup is supported, but a reliable walking connection is unavailable. Supply an actually verified entrance/path before claiming JKP navigation works. TCC is a connected alternative for the demo.
