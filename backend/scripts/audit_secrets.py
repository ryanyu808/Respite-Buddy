"""Read-only, redacted credential-pattern checks; never validate keys over a network.

Run from any directory: python backend/scripts/audit_secrets.py --history --build frontend/dist
This is a focused pattern check, not proof that a repository contains no secrets.
"""

import argparse
import gzip
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[2]
# The left boundary matters: ordinary words ending in 'sk' inside article slugs
# must not be mistaken for the beginning of a credential. Keys in URL query
# parameters, JSON strings, environment assignments and standalone text still match.
RULES = {
    "OpenAI-shaped key": re.compile(
        rb"(?<![A-Za-z0-9_-])sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])"
    ),
    "GitHub token": re.compile(
        rb"(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{20,})"
    ),
    "AWS access key ID": re.compile(rb"(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])"),
    "Google API key": re.compile(rb"(?<![A-Za-z0-9_-])AIza[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])"),
    "Slack token": re.compile(rb"(?<![A-Za-z0-9_-])xox[bpoars]-[A-Za-z0-9-]{10,}"),
    "Stripe secret key": re.compile(rb"(?<![A-Za-z0-9_])(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}"),
    "Private key block": re.compile(rb"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----"),
    "JWT-shaped token": re.compile(rb"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
}


def findings(data: bytes) -> list[tuple[str, int]]:
    """Only return rule names and line numbers, never the matching value."""
    if data.startswith(b"\x1f\x8b"):
        data = gzip.decompress(data)
    return [
        (name, data.count(b"\n", 0, match.start()) + 1)
        for name, pattern in RULES.items()
        for match in pattern.finditer(data)
    ]


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT, stderr=subprocess.DEVNULL)


def source_files():
    paths = git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split(b"\0")
    for raw in sorted(set(paths)):
        if raw:
            path = ROOT / raw.decode("utf-8", errors="surrogateescape")
            if path.is_file():
                yield str(path.relative_to(ROOT)), path.read_bytes()


def history_objects():
    # Includes every reachable local/remote/tag/audit ref, not just main. Scan
    # unique blob and commit objects so deleted files and commit messages count.
    object_ids = sorted({line.split(b" ", 1)[0] for line in git("rev-list", "--objects", "--all").splitlines()})
    result = subprocess.run(
        ["git", "cat-file", "--batch"], cwd=ROOT,
        input=b"\n".join(object_ids) + b"\n", capture_output=True, check=True,
    ).stdout
    offset = 0
    while offset < len(result):
        end = result.index(b"\n", offset)
        oid, kind, raw_size = result[offset:end].split()
        size = int(raw_size)
        offset = end + 1
        data = result[offset:offset + size]
        offset += size + 1
        if kind in {b"blob", b"commit"}:
            yield f"git-object:{oid.decode()}", data


def scan(items, label: str) -> int:
    count = hits = 0
    for path, data in items:
        count += 1
        for name, line in findings(data):
            print(f"{label}: {path}:{line}: {name} [value withheld]")
            hits += 1
    print(f"{label}: scanned {count} files/objects; credential-pattern matches: {hits}")
    return hits


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true", help="Scan all reachable refs and historical objects")
    parser.add_argument("--build", type=Path, help="Scan an existing production output directory")
    args = parser.parse_args()
    try:
        hits = scan(source_files(), "source")
        if args.history:
            hits += scan(history_objects(), "history")
        if args.build:
            build = args.build.resolve()
            if not build.is_dir():
                print("build: output directory unavailable; build verification incomplete")
                return 2
            hits += scan(
                ((str(path.relative_to(build)), path.read_bytes()) for path in sorted(build.rglob("*")) if path.is_file()),
                "build",
            )
        return 1 if hits else 0
    except (OSError, ValueError, subprocess.SubprocessError):
        # Exception messages can contain input data. Keep diagnostics redacted.
        print("Audit could not complete; verify Git access and input files. No values displayed.")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
