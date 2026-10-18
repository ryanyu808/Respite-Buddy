"""Validate a scouting import before replacing data/respite-spots.json."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.spot_library import load_library
from app.respite_models import Spot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', nargs='?', default='data/respite-spots.json')
    parser.add_argument('--schema', action='store_true', help='Regenerate the shared JSON schema instead of importing data.')
    args = parser.parse_args()
    if args.schema:
        target = Path(__file__).resolve().parents[1] / 'data' / 'respite-spots.schema.json'
        schema = {'$schema': 'https://json-schema.org/draft/2020-12/schema', **Spot.model_json_schema()}
        target.write_text(json.dumps(schema, indent=2) + '\n', encoding='utf-8')
        template = target.with_name('respite-spots.scouting-template.json')
        # Preserve any teammate additions to the blank template; add only new keys.
        blank = json.loads(template.read_text(encoding='utf-8'))
        for record in blank:
            for key in Spot.model_fields:
                record.setdefault(key,None)
        template.write_text(json.dumps(blank,indent=2)+'\n',encoding='utf-8')
        print(f'Generated {target}')
        return
    try:
        spots = load_library(Path(args.path))
    except (ValueError, OSError) as exc:
        print(f'IMPORT REJECTED: {exc}', file=sys.stderr)
        raise SystemExit(1)
    warnings = []
    for spot in spots:
        if spot.purpose != 'general':
            warnings.append(f'{spot.id}: dedicated-use space; excluded from recommendations.')
        if not spot.verified_by or not spot.verified_date:
            warnings.append(f'{spot.id}: no scout verification; excluded from live recommendations.')
        if spot.hours is None or spot.access is None:
            warnings.append(f'{spot.id}: unknown hours/access; excluded until confirmed.')
    print(f'VALID: {len(spots)} spots. No data was changed.')
    for warning in warnings:
        print(f'WARNING: {warning}')


if __name__ == '__main__':
    main()
