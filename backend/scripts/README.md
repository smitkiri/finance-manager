# Labels migration parity captures

From `backend/`, capture read-only API scenarios against a **disposable copy**
running the old app, then replay the same requests against the migrated copy.
The command does not run migrations or start either application. Obtain a token
for the disposable household and set `LABELS_PARITY_TOKEN` in the environment.
The token is not written into artifacts.

Copy `tests/fixtures/labels_parity_scenarios.json` outside the repository and adapt
its labels and date ranges to the dataset. Include every saved dashboard's
`POST /api/dashboards/{id}/data` request with explicit date ranges, user views,
refund/transfer and exclusion slices, label AND/OR conditions, and all relevant
pagination offsets. The supplied scenarios are a synthetic starting point.
Quiesce writes/background jobs during both captures. Keep the same dataset and
scenario order. Do not compare different households or newly imported data.

```sh
uv run python -m scripts.labels_parity capture \
  --base-url http://127.0.0.1:8001 \
  --scenarios ~/.agent-plans/finance-manager/2026-11-12-ai-integration/validation/2026-11-18-baseline/scenarios.json \
  --output ~/.agent-plans/finance-manager/2026-11-12-ai-integration/validation/2026-11-18-baseline/before.json

uv run python -m scripts.labels_parity capture \
  --base-url http://127.0.0.1:8002 \
  --replay ~/.agent-plans/finance-manager/2026-11-12-ai-integration/validation/2026-11-18-baseline/before.json \
  --output ~/.agent-plans/finance-manager/2026-11-12-ai-integration/validation/2026-11-18-baseline/after.json

uv run python -m scripts.labels_parity compare \
  ~/.agent-plans/finance-manager/2026-11-12-ai-integration/validation/2026-11-18-baseline/before.json \
  ~/.agent-plans/finance-manager/2026-11-12-ai-integration/validation/2026-11-18-baseline/after.json \
  --output ~/.agent-plans/finance-manager/2026-11-12-ai-integration/validation/2026-11-18-baseline/differences.json
```

Artifacts contain personal data and must stay outside the repo; the command
enforces that for outputs and refuses to overwrite existing files. Only GETs and
the three read-only dashboard POST endpoint patterns are supported. HTTP errors
abort the capture. Requests are saved for exact replay; responses retain their
original JSON numeric text and comparisons parse numbers using `Decimal`.

The comparison reports raw differences, differences after treating label arrays
as sets, and differences after ASCII trimming/blank removal. Its exit code is
nonzero for any remaining set difference, **including normalization changes**.
Inspect and enumerate those expected changes; normalized comparisons are
diagnostics, not an automatic approval. Financial differences are never hidden
by a rounding tolerance. Transaction order is compared too: current expense
pagination orders only by date, so inspect ties explicitly rather than ignoring
different IDs or counts.

This captures server responses, including saved report definitions, but report
totals are calculated in the frontend. Rehearsal must additionally replay the
actual `applyReportFilters`/`generateReportData` functions against both expense
snapshots or use a browser scenario. `reportUtils.test.ts` records the synthetic
baseline separately from dashboard accounting. These tools alone do not satisfy
the real-data, backup, rollback or performance release gates.
