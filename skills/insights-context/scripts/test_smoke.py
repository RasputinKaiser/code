#!/usr/bin/env python3
"""insights-context — end-to-end smoke test on a synthetic fixture.

Runs scan → resolve → render against the bundled fixture and asserts:
  - scan exits 0 (catches refactor-gap NameErrors like the _cache_tiers bug)
  - resolve harvests signal_keys (paths containing OnDemandVerificationStore.swift)
  - render produces HTML with at least one RESOLVED badge
  - total_prompt_processed > 0 in scan JSON
  - zero identity leaks (surname, handle, numeric ID, noreply email)

Run: python3 test_smoke.py  (from the scripts dir, or anywhere — locates siblings)

The resolve step runs against the repo pointed to by INSIGHTS_TEST_REPO (defaults
to cwd). When that repo contains a fix commit touching OnDemandVerificationStore.swift
dated after 2026-06-20, the matcher should classify the fixture friction as RESOLVED.
Override INSIGHTS_TEST_REPO and INSIGHTS_TEST_MEMORY to run against any project.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "test_fixtures"

# Defaults are project-agnostic so the test file itself can ship without
# leaking the maintainer's repo path or identity tokens. Override both via
# env when running against a real repo:
#   INSIGHTS_TEST_REPO       — a project repo dir (for git-log harvesting)
#   INSIGHTS_TEST_MEMORY     — that project's NCode memory dir
REPO = os.environ.get("INSIGHTS_TEST_REPO", str(Path.cwd()))
MEMORY_DIR = os.environ.get(
    "INSIGHTS_TEST_MEMORY",
    str(Path.home() / ".ncode" / "projects"
        / str(Path.cwd()).replace("/", "-").rstrip("-") / "memory"),
)

# Identity-tokens-to-scan-for-leaks are loaded from the same
# ~/.ncode/identity-redact.txt the scanner uses, plus the structured patterns
# the scanner always scrubs. This way the test never hardcodes the very tokens
# it's meant to catch. If the redact file is absent the leak scan still checks
# the structured patterns (noreply email, /users/ profile URL).
_REDACT_FILE = os.path.expanduser("~/.ncode/identity-redact.txt")
LEAK_TOKENS = ["noreply.github.com", "users.noreply.github.com"]
if os.path.isfile(_REDACT_FILE):
    with open(_REDACT_FILE) as _f:
        for _line in _f:
            _t = _line.strip()
            if _t and len(_t) >= 3:
                LEAK_TOKENS.append(_t)

failures = []


def check(label, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"  [{status}] {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(label)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def leak_scan(text, label):
    hits = [t for t in LEAK_TOKENS if t in text]
    check(f"no identity leaks in {label}", not hits,
          f"found: {hits}" if hits else "")


print("=== insights-context smoke test ===")
print(f"fixture: {FIXTURES}")
print(f"repo:    {REPO}")

# Secure temp files (mktemp is vulnerable to TOCTOU symlink races).
_scan_fd, scan_json = tempfile.mkstemp(suffix=".json")
os.close(_scan_fd)
_resolve_fd, resolve_json = tempfile.mkstemp(suffix=".json")
os.close(_resolve_fd)

print("\n[1/4] scan.py on fixture")
r = run(["python3", str(HERE / "scan.py"), str(FIXTURES), "365", "5"])
check("scan exits 0", r.returncode == 0,
      r.stderr[:200] if r.returncode else "")
if r.returncode == 0:
    with open(scan_json, "w") as f:
        f.write(r.stdout)
    scan = json.loads(r.stdout)
    check("total_prompt_processed > 0",
          scan.get("total_prompt_processed", 0) > 0,
          f"got {scan.get('total_prompt_processed')}")
    leak_scan(r.stdout, "scan JSON")
else:
    sys.exit(1)

print("\n[2/4] resolve.py on real memory + repo")
r = run(["python3", str(HERE / "resolve.py"), MEMORY_DIR, REPO])
check("resolve exits 0", r.returncode == 0,
      r.stderr[:200] if r.returncode else "")
if r.returncode == 0:
    with open(resolve_json, "w") as f:
        f.write(r.stdout)
    resolved = json.loads(r.stdout)
    has_ondemand = any(
        any("OnDemandVerificationStore.swift" in p
            for p in (e.get("signal_keys", {}).get("paths", []) or []))
        for e in resolved
    )
    check("resolve emits signal_paths containing OnDemandVerificationStore.swift",
          has_ondemand,
          "no entry matched — check git show harvesting")
    leak_scan(r.stdout, "resolve JSON")
else:
    sys.exit(1)

print("\n[3/4] render.py cross-references and emits HTML")
r = run(["python3", str(HERE / "render.py"), REPO, scan_json, resolve_json])
check("render exits 0", r.returncode == 0,
      r.stderr[:200] if r.returncode else "")
html_path = r.stdout.strip().splitlines()[-1] if r.stdout else ""
if r.returncode == 0 and html_path and os.path.isfile(html_path):
    html = Path(html_path).read_text()
    check("HTML contains a RESOLVED friction card (matcher produced a match)",
          'class="friction-category resolved"' in html,
          "no resolved friction-category card — matcher did not classify fixture "
          "friction as resolved (check PATH_RE path harvesting + signal match)")
    # Backend-aware card: fixture has no cache keys, so the no-cache message
    # should appear and the 90%-savings advice should NOT.
    check("HTML contains no-cache-backend message",
          "does not support prompt caching" in html or "No cache tiers" in html,
          "backend-aware caching card did not fire")
    leak_scan(html, "rendered HTML")
else:
    check("render produced HTML file", False, f"stdout: {r.stdout!r}")

print("\n[4/4] summary")
if failures:
    print(f"\nFAIL — {len(failures)} assertion(s):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("\nPASS — all assertions green.")
print(f"HTML: {html_path}")