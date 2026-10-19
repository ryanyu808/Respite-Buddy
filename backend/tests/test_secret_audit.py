import gzip
import importlib.util
from pathlib import Path

import pytest


spec = importlib.util.spec_from_file_location(
    "secret_audit", Path(__file__).resolve().parents[1] / "scripts" / "audit_secrets.py"
)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def test_article_slugs_and_source_citations_are_not_credentials():
    text = b'https://example.edu/ask-about-campus-rest-spaces-and-study-rooms'
    assert audit.findings(text) == []
    root = Path(__file__).resolve().parents[2]
    for file in ["backend/data/campus-submitted.json", "frontend/src/data/campus-submitted.json"]:
        assert audit.findings((root / file).read_bytes()) == []


@pytest.mark.parametrize("prefix", [b"sk-", b"sk-proj-", b"sk-svcacct-", b"sk-admin-"])
@pytest.mark.parametrize("wrapper", [b'%s', b'KEY=%s', b'{"key":"%s"}', b'https://example.edu/?key=%s'])
def test_actual_key_boundaries_are_detected_without_returning_the_value(prefix, wrapper):
    synthetic = prefix + b"A" * 40
    result = audit.findings(wrapper % synthetic)
    assert result == [("OpenAI-shaped key", 1)]
    assert synthetic.decode() not in repr(result)


def test_compressed_data_is_scanned_and_line_numbers_are_preserved():
    text = b"first line\nKEY=" + b"sk-" + b"B" * 40
    assert audit.findings(gzip.compress(text)) == [("OpenAI-shaped key", 2)]


def test_cli_reporting_withholds_matching_values(capsys):
    synthetic = b"sk-" + b"C" * 40
    assert audit.scan([("fixture.json", synthetic)], "fixture") == 1
    output = capsys.readouterr().out
    assert "fixture.json:1" in output and "value withheld" in output
    assert synthetic.decode() not in output
