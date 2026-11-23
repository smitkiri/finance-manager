"""Ensure the rehearsal tool detects accounting and matching regressions."""

import json

import httpx
import pytest

from scripts.labels_parity import capture, compare, validate_scenarios, write_json


def snapshot(response):
    return {
        "version": 1,
        "results": [
            {
                "scenario": {"name": "expenses", "path": "/api/expenses"},
                "response": response,
            }
        ],
    }


def test_comparison_enumerates_normalization_without_hiding_matching_changes():
    before = snapshot('[{"id":"a","labels":[" Flight ","Flight",""],"amount":10.10}]')
    after = snapshot('[{"id":"a","labels":["Flight"],"amount":10.1}]')
    report = compare(before, after)[0]
    assert report["rawDifferences"] == ["$[0].labels.length"]
    assert report["setDifferences"] == ["$[0].labels.length"]
    assert report["normalizedDifferences"] == []
    changed_ids = snapshot('[{"id":"b","labels":["Flight"],"amount":10.1}]')
    assert compare(before, changed_ids)[0]["normalizedDifferences"] == ["$[0].id"]


def test_decimal_comparison_detects_one_cent_without_float_rounding():
    before = snapshot('{"total":9999999999999.10}')
    after = snapshot('{"total":9999999999999.11}')
    assert compare(before, after)[0]["setDifferences"] == ["$.total"]


def test_only_label_order_and_duplicates_are_ignored():
    before = snapshot('{"labels":["Hotel","Flight","Hotel"],"ids":["a","b"]}')
    after = snapshot('{"labels":["Flight","Hotel"],"ids":["b","a"]}')
    assert compare(before, after)[0]["setDifferences"] == ["$.ids[0]", "$.ids[1]"]


def test_comparison_requires_identical_requests():
    before, after = snapshot("[]"), snapshot("[]")
    after["results"][0]["scenario"]["params"] = {"limit": 1}
    with pytest.raises(ValueError, match="identical"):
        compare(before, after)


@pytest.mark.parametrize(
    "scenario",
    [
        {"name": "write", "path": "/api/expenses", "method": "POST"},
        {"name": "write", "path": "/api/data/delete-all", "method": "DELETE"},
        {"name": "remote", "path": "https://example.com/api/expenses"},
        {"name": "remote", "path": "//example.com/api/expenses"},
        {"name": "traversal", "path": "/api/../expenses"},
    ],
)
def test_capture_rejects_mutations_and_remote_paths(scenario):
    with pytest.raises(ValueError):
        validate_scenarios([scenario])


def test_capture_and_replay_preserve_requests_and_decimal_text():
    def handler(request):
        assert request.headers["Authorization"] == "Bearer local-test-token"
        assert request.url.path == "/api/dashboard-panels/preview"
        assert json.loads(request.content) == {"filterGroups": []}
        return httpx.Response(200, text='{"total":123456789.12}')

    scenarios = [
        {
            "name": "preview",
            "method": "POST",
            "path": "/api/dashboard-panels/preview",
            "body": {"filterGroups": []},
        }
    ]
    with httpx.Client(
        base_url="http://test",
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "Bearer local-test-token"},
    ) as client:
        baseline = capture(client, scenarios)
        replay = capture(client, [row["scenario"] for row in baseline["results"]])
    assert baseline["results"][0]["response"] == '{"total":123456789.12}'
    assert "local-test-token" not in json.dumps(baseline)
    assert compare(baseline, replay)[0]["rawDifferences"] == []


def test_snapshot_protects_source_tree_and_previous_baseline(tmp_path, monkeypatch):
    monkeypatch.setattr("scripts.labels_parity.REPO_ROOT", tmp_path / "repo")
    with pytest.raises(ValueError, match="outside"):
        write_json(tmp_path / "repo" / "snapshot.json", {})
    destination = tmp_path / "artifacts" / "before.json"
    write_json(destination, {"version": 1})
    with pytest.raises(FileExistsError):
        write_json(destination, {})
    assert json.loads(destination.read_text()) == {"version": 1}
