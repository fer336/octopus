# Archive Report: apl-84-reportes

**Archived**: 2026-09-08
**Destination**: `openspec/changes/archive/2026-09-08-apl-84-reportes/`
**Final status**: Archived — verification verdict `pass_with_warnings` (validator-admitted), Task Completion Gate passed (23/23), no CRITICAL findings. Not an intentional-with-warnings override; the non-blocking warnings below are recorded as post-archive polish, explicitly deferred by the orchestrator.

## Final State at Close

- **Implementation**: commits `30e0f8b..a996af0` (PR1–PR4: shared dataset foundation, 4 restyled reports, inventory-count integration, 5 new reports, frontend hub, docs) + `beabeea` (remediation: 4 boundary tests, test-only, 181 insertions, zero production code).
- **Verification**: PASS WITH WARNINGS — `verify-report.md` (validator-admitted, evidence revision `sha256:e2541ad74a7793cd78b8d88c5765a5e1e8bf2fb31bb245736f1b0b678bc246f1`): 33/33 requirements, 66/66 scenarios (0 UNTESTED, 0 FAILING), 40/40 backend tests, frontend build exit 0, 0 critical. Supersedes the failed verification `sha256:d21ae62653ca7e479adb81d1d5b4869147c8518085bb7a98660d660cbafbc1a5`.
- **Tasks**: 23/23 complete in the archived `tasks.md` (no unchecked items).
- **Branch**: `qevaaisolutions/apl-84-reportes-unificar-diseno-con-ordenes-de-pedido-y-completar`.

## Post-Archive Polish (non-blocking warnings — deferred, do NOT fix as part of this cycle)

1. Category PDF renders an aggregate totals footer instead of per-category totals/headings (spec asks for per-category presentation; PARTIAL, not a runtime failure).
2. Spreadsheet parity for the 4 restyled reports (stock, sales, top-products, client-accounts) is header/content-type level only; full row-value parity is proven only for inventory-count.
3. Visual-language scenarios (multi-page header repetition, generated-at timestamp) rest on static template CSS plus the task 3.3 manual render; no automated test parses PDF content.

Suggestions (housekeeping): `ruff SIM108` in `base_report_service.py`; frontend chunk splitting (tenant, CartesianChart > 500 kB); remove leftover `*_demo.html` templates.

## Design Resolution Carried Forward

Category and supplier report date filters resolve to `Product.created_at` with an **inclusive** range (documented in `design.md` Open Question — RESOLVED — and as Clarifying Notes in both the category-report and supplier-report specs); boundary tests added in remediation commit `beabeea`.

## Specs Synced

`openspec/specs/` did not exist before this archive; it was created and the change-local full capability specs were copied mechanically (`cp -R` + `diff -r` readback, empty diff). Domains synced under `openspec/specs/reports/`:

stock-report, sales-report, top-products-report, client-accounts-report, category-report, supplier-report, purchase-order-history-report, stockpile-withdrawals-report, current-account-withdrawals-report, inventory-count-report, cross-cutting.

## Engram Traceability (observation IDs read)

- `sdd/apl-84-reportes/design` → #4398
- `sdd/apl-84-reportes/tasks` → #4399
- `sdd/apl-84-reportes/apply-progress` → #4402 (intermediate snapshot; remediation slice)
- `sdd/apl-84-reportes/verify-report` → #4410
- Proposal: no dedicated Engram observation located by search; the artifact of record is the archived `proposal.md` (hybrid mode: openspec file is authoritative for that artifact).

## Mechanical Copy Evidence

- Spec sync: `diff -r openspec/changes/apl-84-reportes/specs/reports openspec/specs/reports` → no output, exit 0.
- Archive move: `diff -r $snapshot/source openspec/changes/archive/2026-09-08-apl-84-reportes` → no output, exit 0. `git mv` failed (openspec/ untracked); guarded fallback `mv` used after verifying the source matched its pre-move snapshot. This file (`archive-report.md`) is additive-only and was written after the readback.

## Final-State Authority Notes

Per the archive Final-State Authority hierarchy, the numbers above are carried from the highest-ranked sources: the persisted `tasks.md` (23/23) and the orchestrator's launch prompt (remediation commit, deferred warnings). The `verify-report` and `apply-progress` are intermediate snapshots; the remediation commit `beabeea` postdates the earlier failed verification and resolves all 4 prior CRITICAL UNTESTED findings. No unrankable contradictions were found between sources.
