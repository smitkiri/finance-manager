"""Capture/replay read-only API scenarios against a disposable migration copy.

Run `uv run python -m scripts.labels_parity --help` from backend/. The bearer
token is read from LABELS_PARITY_TOKEN and is never saved in the snapshot.
"""

import argparse
import json
import os
import re
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
ASCII_WHITESPACE = " \t\n\r\f\v"
READ_POSTS = re.compile(
    r"/api/(dashboard-panels/(preview|chart-preview)|dashboards/[^/]+/data)"
)


def read_json(path):
    return json.loads(path.expanduser().read_text())


def write_json(path, value):
    """Keep potentially personal snapshots outside the source tree."""
    path = path.expanduser().resolve()
    if path.is_relative_to(REPO_ROOT):
        raise ValueError("Save parity artifacts outside the repository")
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also prevents accidentally overwriting the baseline.
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write("\n")


def validate_scenarios(scenarios):
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("Expected a nonempty array of scenarios")
    names = set()
    for scenario in scenarios:
        name = scenario["name"]
        if not isinstance(name, str) or not name or name in names:
            raise ValueError("Scenario names must be nonempty and unique")
        names.add(name)
        path = scenario["path"]
        if not isinstance(path, str) or not re.fullmatch(r"/api/[\w/-]+", path):
            raise ValueError("Scenario paths must be local /api/ paths")
        method = scenario.get("method", "GET")
        if method != "GET" and not (method == "POST" and READ_POSTS.fullmatch(path)):
            raise ValueError("Only GET and the read-only dashboard POSTs are allowed")


def capture(client, scenarios):
    validate_scenarios(scenarios)
    results = []
    for scenario in scenarios:
        response = client.request(
            scenario.get("method", "GET"),
            scenario["path"],
            params=scenario.get("params"),
            json=scenario.get("body"),
        )
        response.raise_for_status()
        # Store exact response text; parse with Decimal when comparing.
        json.loads(response.text)
        results.append({"scenario": scenario, "response": response.text})
    return {
        "version": 1,
        "capturedAt": datetime.now(UTC).isoformat(),
        "results": results,
    }


def canonical(value, key=None, normalize_names=False):
    if isinstance(value, dict):
        return {
            name: canonical(
                child,
                "labels"
                if name == "value" and value.get("field") == "labels"
                else name,
                normalize_names,
            )
            for name, child in value.items()
        }
    if isinstance(value, list):
        if key == "labels" and all(isinstance(name, str) for name in value):
            names = value
            if normalize_names:
                names = [name.strip(ASCII_WHITESPACE) for name in names]
                names = [name for name in names if name]
            return sorted(set(names))
        return [canonical(child, normalize_names=normalize_names) for child in value]
    return value


def differences(before, after, path="$"):
    """Return paths only, so terminal output never contains transaction data."""
    if isinstance(before, dict) and isinstance(after, dict):
        result = []
        for key in sorted(before.keys() | after.keys()):
            child_path = f"{path}.{key}"
            if key not in before or key not in after:
                result.append(child_path)
            else:
                result.extend(differences(before[key], after[key], child_path))
        return result
    if isinstance(before, list) and isinstance(after, list):
        if len(before) != len(after):
            return [f"{path}.length"]
        return [
            diff
            for index, (left, right) in enumerate(zip(before, after, strict=True))
            for diff in differences(left, right, f"{path}[{index}]")
        ]
    return [] if before == after else [path]


def compare(before, after):
    if before["version"] != 1 or after["version"] != 1:
        raise ValueError("Unsupported snapshot version")
    if [r["scenario"] for r in before["results"]] != [
        r["scenario"] for r in after["results"]
    ]:
        raise ValueError("Snapshots must use identical ordered scenarios")
    results = []
    for index, (left, right) in enumerate(
        zip(before["results"], after["results"], strict=True)
    ):
        old = json.loads(left["response"], parse_float=Decimal)
        new = json.loads(right["response"], parse_float=Decimal)
        results.append(
            {
                "scenarioIndex": index,
                "rawDifferences": differences(old, new),
                "setDifferences": differences(canonical(old), canonical(new)),
                "normalizedDifferences": differences(
                    canonical(old, normalize_names=True),
                    canonical(new, normalize_names=True),
                ),
            }
        )
    # Normalization differences must still be inspected and approved locally.
    # No normalization or currency tolerance silently turns a mismatch green.
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    snapshot = commands.add_parser("capture")
    snapshot.add_argument("--base-url", required=True)
    inputs = snapshot.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--scenarios", type=Path)
    inputs.add_argument(
        "--replay", type=Path, help="Reuse requests from a prior snapshot"
    )
    snapshot.add_argument("--output", type=Path, required=True)
    diff = commands.add_parser("compare")
    diff.add_argument("before", type=Path)
    diff.add_argument("after", type=Path)
    diff.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "compare":
        report = compare(read_json(args.before), read_json(args.after))
        write_json(args.output, report)
        mismatches = sum(bool(item["setDifferences"]) for item in report)
        print(
            f"{mismatches} scenarios differ "
            "(label order/duplicates ignored); inspect report"
        )
        return int(bool(mismatches))
    token = os.environ["LABELS_PARITY_TOKEN"]
    scenarios = (
        [item["scenario"] for item in read_json(args.replay)["results"]]
        if args.replay
        else read_json(args.scenarios)
    )
    with httpx.Client(
        base_url=args.base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
        follow_redirects=False,
    ) as client:
        result = capture(client, scenarios)
    write_json(args.output, result)
    print(f"Captured {len(scenarios)} scenarios")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
