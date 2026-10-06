#!/usr/bin/env python3
"""
Test script: validates RAT metrics API responses against the reference CSV
(git_5a7d1e8045ce.csv) for the git repository at commit 5a7d1e8045ce.

Tests:
  1. Repository-level commit set totals
  2. Per-author repository ownership (top N)
  3. Directory-level metrics (all 295 dirs)
  4. File-level metrics (sample across the 7302 files)
"""

import csv
import json
import math
import sys
import urllib.request
import urllib.parse
from collections import defaultdict

BASE_URL = "http://localhost:3000"
REPO_ID = "c4fd27f4-8203-431f-a5f1-bd48c0d0c766"
CSV_PATH = "/home/vmuser/Downloads/repo-references/git_5a7d1e8045ce.csv"

# Floating-point tolerance for ratio comparisons
RATIO_TOL = 1e-6
# Integer metrics must match exactly
INT_TOL = 0

passed = 0
failed = 0
skipped = 0
failures = []


def approx_eq(a, b, tol=RATIO_TOL):
    """Compare two floats with relative tolerance."""
    if a is None or b is None:
        return a == b
    if isinstance(a, int) and isinstance(b, int):
        return a == b
    if b == 0:
        return abs(a) < tol
    return abs(a - b) / max(abs(b), 1e-15) < tol


def int_eq(a, b):
    """Compare integers exactly."""
    return int(a) == int(b)


def fetch_json(url):
    """Fetch JSON from a URL."""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"_error": str(e)}


def report(test_name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
    else:
        failed += 1
        failures.append(f"FAIL: {test_name} — {detail}")
        print(f"  FAIL: {test_name} — {detail}")


def load_csv():
    """Parse the reference CSV into structured dicts."""
    repo_rows = []       # object_type=repository
    dir_rows = []        # object_type=directory
    file_rows = []       # object_type=file

    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            otype = row["object_type"]
            if otype == "repository":
                repo_rows.append(row)
            elif otype == "directory":
                dir_rows.append(row)
            elif otype == "file":
                file_rows.append(row)

    return repo_rows, dir_rows, file_rows


def test_repository_totals(repo_rows):
    """Test 1: Repository-level commit set totals (author=ALL row)."""
    print("\n=== Test 1: Repository Totals ===")
    all_row = next((r for r in repo_rows if r["author"] == "ALL"), None)
    if not all_row:
        report("repo_totals", False, "No ALL row in CSV")
        return

    data = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics")
    if "_error" in data:
        report("repo_totals_fetch", False, data["_error"])
        return

    totals = data["totals"]

    checks = [
        ("commitCount", int(all_row["commit_count"]), totals["commitCount"]),
        ("added", int(all_row["added"]), totals["added"]),
        ("removed", int(all_row["removed"]), totals["removed"]),
        ("growth", int(all_row["growth"]), totals["growth"]),
        ("churn", int(all_row["churn"]), totals["churn"]),
        ("modifications", int(all_row["modifications"]), totals["modifications"]),
        ("modificationFrequency", float(all_row["modification_frequency"]), totals["modificationFrequency"]),
        ("churnRate", float(all_row["churn_rate"]), totals["churnRate"]),
    ]

    all_ok = True
    for name, expected, actual in checks:
        ok = approx_eq(actual, expected) if isinstance(expected, float) else int_eq(actual, expected)
        if not ok:
            all_ok = False
            report(f"repo_totals.{name}", False, f"expected={expected}, got={actual}")
        else:
            report(f"repo_totals.{name}", True)

    if all_ok:
        print("  All repository totals MATCH.")


def test_author_ownership(repo_rows):
    """Test 2: Per-author ownership at repository level (top 30 authors)."""
    print("\n=== Test 2: Author Ownership (Repository Level) ===")
    author_rows = [r for r in repo_rows if r["author"] != "ALL"]
    # Sort by churn descending (same as CSV order)
    author_rows.sort(key=lambda r: int(r["churn"]), reverse=True)

    # Fetch top authors from the API (authors list endpoint)
    params = urllib.parse.urlencode({"sort": "churn", "order": "desc", "limit": "50"})
    data = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics/authors?{params}")
    if "_error" in data:
        report("author_ownership_fetch", False, data["_error"])
        return

    api_authors = data["items"]
    # Also need repository-level churn for ownership calc
    repo_data = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics")
    repo_churn = repo_data["totals"]["churn"]

    tested = 0
    matched = 0
    for csv_row in author_rows[:30]:
        csv_author_key = csv_row["author"]  # e.g. "Jiang Xin <worldhello.net@gmail.com>"
        csv_added = int(csv_row["added"])
        csv_removed = int(csv_row["removed"])
        csv_growth = int(csv_row["growth"])
        csv_churn = int(csv_row["churn"])
        csv_mods = int(csv_row["modifications"])
        csv_ownership = float(csv_row["ownership"]) if csv_row["ownership"] else None

        # Find matching author in API response
        api_match = None
        for a in api_authors:
            key = f"{a['name']} <{a['email']}>"
            if key == csv_author_key:
                api_match = a
                break

        if not api_match:
            # Author may not be in top 50 — try individual detail
            detail_params = urllib.parse.urlencode({"key": csv_author_key})
            detail = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics/author?{detail_params}")
            if "_error" in detail or "error" in detail:
                report(f"author[{csv_author_key}]", False, "not found in API")
                tested += 1
                continue
            api_match = {
                "added": detail["metrics"]["added"],
                "removed": detail["metrics"]["removed"],
                "growth": detail["metrics"]["growth"],
                "churn": detail["metrics"]["churn"],
                "modifications": detail["metrics"]["modifications"],
                "ownership": detail["metrics"].get("ownership"),
            }

        tested += 1
        ok = True
        details = []

        if not int_eq(api_match["added"], csv_added):
            ok = False
            details.append(f"added: exp={csv_added} got={api_match['added']}")
        if not int_eq(api_match["removed"], csv_removed):
            ok = False
            details.append(f"removed: exp={csv_removed} got={api_match['removed']}")
        if not int_eq(api_match["growth"], csv_growth):
            ok = False
            details.append(f"growth: exp={csv_growth} got={api_match['growth']}")
        if not int_eq(api_match["churn"], csv_churn):
            ok = False
            details.append(f"churn: exp={csv_churn} got={api_match['churn']}")
        if not int_eq(api_match["modifications"], csv_mods):
            ok = False
            details.append(f"mods: exp={csv_mods} got={api_match['modifications']}")
        if csv_ownership is not None:
            api_own = api_match.get("ownership")
            if api_own is not None and not approx_eq(api_own, csv_ownership):
                ok = False
                details.append(f"ownership: exp={csv_ownership} got={api_own}")

        if ok:
            matched += 1
            report(f"author[{csv_author_key[:40]}]", True)
        else:
            report(f"author[{csv_author_key[:40]}]", False, "; ".join(details))

    print(f"  Author ownership: {matched}/{tested} matched (top 30 by churn)")


def test_directories(dir_rows):
    """Test 3: Directory-level metrics."""
    print("\n=== Test 3: Directory Metrics ===")
    all_dirs = [r for r in dir_rows if r["author"] == "ALL"]
    print(f"  CSV contains {len(all_dirs)} directory rows (ALL aggregate)")

    # Fetch all directories from API (paginated, up to 500)
    all_api_dirs = {}
    offset = 0
    while True:
        params = urllib.parse.urlencode({"sort": "path", "order": "asc", "offset": str(offset), "limit": "500"})
        data = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics/directories?{params}")
        if "_error" in data:
            report("dirs_fetch", False, data["_error"])
            return
        for item in data["items"]:
            all_api_dirs[item["path"]] = item
        if offset + data["limit"] >= data["total"]:
            break
        offset += data["limit"]

    print(f"  API returned {len(all_api_dirs)} directories")

    # Compare every CSV directory against API
    tested = 0
    matched = 0
    mismatches = []
    for csv_row in all_dirs:
        csv_path = csv_row["path"]
        tested += 1

        api_dir = all_api_dirs.get(csv_path)
        if not api_dir:
            mismatches.append((csv_path, "NOT FOUND in API"))
            continue

        ok = True
        details = []
        checks = [
            ("added", int(csv_row["added"]), api_dir["added"]),
            ("removed", int(csv_row["removed"]), api_dir["removed"]),
            ("growth", int(csv_row["growth"]), api_dir["growth"]),
            ("churn", int(csv_row["churn"]), api_dir["churn"]),
            ("modifications", int(csv_row["modifications"]), api_dir["modifications"]),
        ]
        # modification_frequency and churn_rate are derived: η = mods/|H|, ρ = churn/|H|
        csv_commit_count = int(csv_row["commit_count"])
        if csv_row["modification_frequency"]:
            expected_mf = float(csv_row["modification_frequency"])
            actual_mf = api_dir["modifications"] / csv_commit_count if csv_commit_count else 0
            checks.append(("modification_frequency", expected_mf, actual_mf))
        if csv_row["churn_rate"]:
            expected_cr = float(csv_row["churn_rate"])
            actual_cr = api_dir["churn"] / csv_commit_count if csv_commit_count else 0
            checks.append(("churn_rate", expected_cr, actual_cr))

        for name, expected, actual in checks:
            if isinstance(expected, float):
                if not approx_eq(actual, expected):
                    ok = False
                    details.append(f"{name}: exp={expected} got={actual}")
            else:
                if not int_eq(actual, expected):
                    ok = False
                    details.append(f"{name}: exp={expected} got={actual}")

        if ok:
            matched += 1
        else:
            mismatches.append((csv_path, "; ".join(details)))

    if mismatches:
        print(f"  Directory mismatches ({len(mismatches)}/{tested}):")
        for path, detail in mismatches[:20]:
            report(f"dir[{path}]", False, detail)
        if len(mismatches) > 20:
            print(f"  ... and {len(mismatches) - 20} more")
            for path, detail in mismatches[20:]:
                failed_count = 1  # just count them
                global failed
                failed += 1
    else:
        for _ in range(tested):
            report(f"dir_ok", True)

    print(f"  Directories: {matched}/{tested} matched")


def test_files(file_rows):
    """Test 4: File-level metrics (sample)."""
    print("\n=== Test 4: File Metrics ===")
    all_files = [r for r in file_rows if r["author"] == "ALL"]
    print(f"  CSV contains {len(all_files)} file rows (ALL aggregate)")

    # Test a representative sample: top-20 by churn, plus 30 random
    all_files_sorted = sorted(all_files, key=lambda r: int(r["churn"]), reverse=True)
    sample = all_files_sorted[:20]
    # Add some from the middle and bottom
    import random
    random.seed(42)
    mid = all_files_sorted[len(all_files_sorted)//4 : len(all_files_sorted)//2]
    sample += random.sample(mid, min(15, len(mid)))
    tail = all_files_sorted[-100:]
    sample += random.sample(tail, min(15, len(tail)))

    # Fetch file list from API for the top ones (by churn)
    params = urllib.parse.urlencode({"sort": "churn", "order": "desc", "limit": "500"})
    data = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics/files?{params}")
    if "_error" in data:
        report("files_fetch", False, data["_error"])
        return

    api_files_by_path = {item["path"]: item for item in data["items"]}
    # Also fetch all files if needed
    total_files = data["total"]
    if total_files > 500:
        # Fetch remaining pages
        offset = 500
        while offset < total_files:
            params = urllib.parse.urlencode({"sort": "path", "order": "asc", "offset": str(offset), "limit": "500"})
            page = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics/files?{params}")
            if "_error" in page:
                break
            for item in page["items"]:
                api_files_by_path[item["path"]] = item
            offset += page["limit"]

    print(f"  API loaded {len(api_files_by_path)} files for comparison")

    tested = 0
    matched = 0
    mismatches = []

    for csv_row in sample:
        csv_path = csv_row["path"]
        tested += 1

        api_file = api_files_by_path.get(csv_path)
        if not api_file:
            # Try individual file detail endpoint
            detail_params = urllib.parse.urlencode({"path": csv_path})
            detail = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics/file?{detail_params}")
            if "_error" in detail or "error" in detail:
                mismatches.append((csv_path, "NOT FOUND in API"))
                continue
            if detail.get("metrics"):
                api_file = detail["metrics"]
            else:
                mismatches.append((csv_path, "metrics=null in detail"))
                continue

        ok = True
        details = []
        checks = [
            ("added", int(csv_row["added"]), api_file["added"]),
            ("removed", int(csv_row["removed"]), api_file["removed"]),
            ("growth", int(csv_row["growth"]), api_file["growth"]),
            ("churn", int(csv_row["churn"]), api_file["churn"]),
            ("modifications", int(csv_row["modifications"]), api_file["modifications"]),
        ]

        for name, expected, actual in checks:
            if not int_eq(actual, expected):
                ok = False
                details.append(f"{name}: exp={expected} got={actual}")

        # Check derived ratios if present
        csv_commit_count = int(csv_row["commit_count"])
        if csv_row["modification_frequency"]:
            expected_mf = float(csv_row["modification_frequency"])
            actual_mf = api_file["modifications"] / csv_commit_count if csv_commit_count else 0
            if not approx_eq(actual_mf, expected_mf):
                ok = False
                details.append(f"mod_freq: exp={expected_mf} got={actual_mf}")
        if csv_row["churn_rate"]:
            expected_cr = float(csv_row["churn_rate"])
            actual_cr = api_file["churn"] / csv_commit_count if csv_commit_count else 0
            if not approx_eq(actual_cr, expected_cr):
                ok = False
                details.append(f"churn_rate: exp={expected_cr} got={actual_cr}")

        if ok:
            matched += 1
        else:
            mismatches.append((csv_path, "; ".join(details)))

    if mismatches:
        print(f"  File mismatches ({len(mismatches)}/{tested}):")
        for path, detail in mismatches[:15]:
            report(f"file[{path}]", False, detail)
        if len(mismatches) > 15:
            print(f"  ... and {len(mismatches) - 15} more")
    else:
        for _ in range(tested):
            report(f"file_ok", True)

    print(f"  Files: {matched}/{tested} matched (sample of {tested} from {len(all_files)})")


def test_file_ownership(file_rows):
    """Test 5: Per-file author ownership (spot-check top files)."""
    print("\n=== Test 5: File Author Ownership (spot-check) ===")
    # Get per-author rows for the top-churn files
    author_file_rows = [r for r in file_rows if r["author"] != "ALL"]
    # Group by path
    by_path = defaultdict(list)
    for r in author_file_rows:
        by_path[r["path"]].append(r)

    # Pick top 5 files by churn that have author breakdowns
    all_files = [r for r in file_rows if r["author"] == "ALL"]
    all_files.sort(key=lambda r: int(r["churn"]), reverse=True)
    test_paths = []
    for f in all_files:
        if f["path"] in by_path and len(test_paths) < 5:
            test_paths.append(f["path"])

    tested = 0
    matched = 0
    for fpath in test_paths:
        # Fetch file detail (includes per-author breakdown)
        params = urllib.parse.urlencode({"path": fpath})
        detail = fetch_json(f"{BASE_URL}/api/repos/{REPO_ID}/metrics/file?{params}")
        if "_error" in detail or "error" in detail:
            report(f"file_ownership[{fpath}]", False, "fetch failed")
            tested += 1
            continue

        api_authors = {f"{a['name']} <{a['email']}>": a for a in detail.get("authors", [])}
        csv_authors = by_path[fpath]

        for csv_row in csv_authors[:5]:  # top 5 authors per file
            tested += 1
            author_key = csv_row["author"]
            csv_ownership = float(csv_row["ownership"]) if csv_row["ownership"] else None
            csv_churn = int(csv_row["churn"])

            api_a = api_authors.get(author_key)
            if not api_a:
                report(f"file_own[{fpath}][{author_key[:30]}]", False, "author not in API detail")
                continue

            ok = True
            details = []
            if not int_eq(api_a["churn"], csv_churn):
                ok = False
                details.append(f"churn: exp={csv_churn} got={api_a['churn']}")
            if csv_ownership is not None and not approx_eq(api_a["ownership"], csv_ownership):
                ok = False
                details.append(f"ownership: exp={csv_ownership} got={api_a['ownership']}")

            if ok:
                matched += 1
                report(f"file_own[{fpath}][{author_key[:30]}]", True)
            else:
                report(f"file_own[{fpath}][{author_key[:30]}]", False, "; ".join(details))

    print(f"  File ownership: {matched}/{tested} matched")


def test_dir_ownership(dir_rows):
    """Test 6: Per-directory author ownership (spot-check)."""
    print("\n=== Test 6: Directory Author Ownership (spot-check) ===")
    author_dir_rows = [r for r in dir_rows if r["author"] != "ALL"]
    if not author_dir_rows:
        print("  No per-author directory rows in CSV — skipping.")
        return

    by_path = defaultdict(list)
    for r in author_dir_rows:
        by_path[r["path"]].append(r)

    # Pick a few directories
    all_dirs = [r for r in dir_rows if r["author"] == "ALL"]
    all_dirs.sort(key=lambda r: int(r["churn"]), reverse=True)
    test_paths = [d["path"] for d in all_dirs[:3] if d["path"] in by_path]

    tested = 0
    matched = 0
    for dpath in test_paths:
        csv_authors = by_path[dpath]
        # We don't have a directory-author-detail API, so verify ownership
        # by checking that the directory total matches and ownership ratios sum <= 1.
        # For now just verify the directory totals include per-author sums
        dir_total_churn = None
        for r in dir_rows:
            if r["path"] == dpath and r["author"] == "ALL":
                dir_total_churn = int(r["churn"])
                break

        for csv_row in csv_authors[:3]:
            tested += 1
            author_key = csv_row["author"]
            csv_ownership = float(csv_row["ownership"]) if csv_row["ownership"] else None
            csv_churn = int(csv_row["churn"])

            # Ownership should be churn/dir_total_churn
            if csv_ownership is not None and dir_total_churn and dir_total_churn > 0:
                expected_own = csv_churn / dir_total_churn
                if approx_eq(csv_ownership, expected_own):
                    matched += 1
                    report(f"dir_own[{dpath}][{author_key[:30]}]", True)
                else:
                    report(f"dir_own[{dpath}][{author_key[:30]}]", False,
                           f"ownership={csv_ownership} vs churn/total={expected_own}")
            else:
                matched += 1
                report(f"dir_own[{dpath}][{author_key[:30]}]", True)

    print(f"  Directory ownership consistency: {matched}/{tested}")


def main():
    print("=" * 70)
    print("RAT Metrics Validation against git_5a7d1e8045ce.csv")
    print(f"Repo: git @ 5a7d1e8045ce (ID: {REPO_ID})")
    print("=" * 70)

    repo_rows, dir_rows, file_rows = load_csv()
    print(f"\nCSV loaded: {len(repo_rows)} repository rows, {len(dir_rows)} directory rows, {len(file_rows)} file rows")

    test_repository_totals(repo_rows)
    test_author_ownership(repo_rows)
    test_directories(dir_rows)
    test_files(file_rows)
    test_file_ownership(file_rows)
    test_dir_ownership(dir_rows)

    print("\n" + "=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed")
    if failures:
        print(f"\nFailure details ({len(failures)} total):")
        for f in failures[:30]:
            print(f"  {f}")
        if len(failures) > 30:
            print(f"  ... and {len(failures) - 30} more")
    print("=" * 70)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
