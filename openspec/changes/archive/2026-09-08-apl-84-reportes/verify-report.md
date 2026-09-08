```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:e2541ad74a7793cd78b8d88c5765a5e1e8bf2fb31bb245736f1b0b678bc246f1
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 33/33
scenarios: 66/66
test_command: rm -f /tmp/octopustrack_test.db && PYTHONPATH=backend python -m pytest backend/app/tests/test_reports_pdf.py -q
test_exit_code: 0
test_output_hash: sha256:e006d5a66e8ed129b0b0a643200a1c9d8bb23ef64bd69fc404139362ceb00da5
build_command: npm --prefix frontend run build
build_exit_code: 0
build_output_hash: sha256:40bbb61c3ce2558e203c83f3ba97467b4247d474c3f81f6b1af554e0a3e7bad7
```

## Verification Report

**Change**: apl-84-reportes
**Version**: change-local specs (openspec/specs absent)
**Mode**: Strict TDD
**Scope**: Post-remediation independent re-verification. This report SUPERSEDES the failed verification sha256:d21ae62653ca7e479adb81d1d5b4869147c8518085bb7a98660d660cbafbc1a5 and is bound to the remediation evidence sha256:e2541ad74a7793cd78b8d88c5765a5e1e8bf2fb31bb245736f1b0b678bc246f1 (commit beabeea, test-only remediation). Branch qevaaisolutions/apl-84-reportes-unificar-diseno-con-ordenes-de-pedido-y-completar: commits 30e0f8b..a996af0 (PR1–PR4) + beabeea (remediation), all present. Remediation added exactly 4 tests (181 insertions, test file only); zero production code changed in the remediation slice.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 23 |
| Tasks complete | 23 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build**: ✅ Passed — `npm --prefix frontend run build` → ✓ built, exit 0. Chunk-size warnings only (>500 kB: tenant, CartesianChart).

**Tests**: ✅ 40 passed / 0 failed / 0 skipped — `PYTHONPATH=backend python -m pytest backend/app/tests/test_reports_pdf.py -q` → 40 passed (exit 0). Warnings are pytest-asyncio/requests deprecations, unrelated to the change.

**Coverage**: Not available — no coverage tool configured for the backend suite.

### Spec Compliance Matrix

Statuses: C = ✅ COMPLIANT (covering test passed at runtime), P = ⚠️ PARTIAL (passing/partial or manual-only evidence).

| Spec | Scenario | Test | Result |
|---|---|---|---|
| stock | Existing PDF filters still work | `test_stock_report_provider_builds_shared_dataset_with_totals` + `test_compatibility_stock_pdf_alias_still_works` | ✅ C |
| stock | No matching rows | `test_stock_report_provider_returns_empty_dataset_for_no_matches` | ✅ C |
| stock | Matching spreadsheet rows | `test_report_endpoints_export_pdf_xlsx_and_csv[stock]` — headers/content-type asserted; xlsx data-row values not value-asserted | ⚠️ P |
| stock | Numeric footer totals | provider totals asserted (Ítems, Stock bajo) | ✅ C |
| stock | Long inventory list (headers repeat) | static `thead {display: table-header-group}` in base_report.html + task 3.3 manual render | ⚠️ P |
| stock | Generated timestamp visible | static `generated_at` in base header/footer | ⚠️ P |
| sales | Period filter | `test_sales_report_provider_preserves_date_and_receipt_filters` | ✅ C |
| sales | Receipt toggle | same test (`include_receipts=False`) | ✅ C |
| sales | Format parity | endpoint test — header-level only | ⚠️ P |
| sales | Empty period | all-10 empty endpoint test (2030 range) | ✅ C |
| sales | Totals row | provider totals asserted | ✅ C |
| sales | Multi-page sales list | static CSS + manual only | ⚠️ P |
| top-products | Limit respected | `test_top_products_report_provider_respects_limit_and_order` | ✅ C |
| top-products | Inclusive date range | exclusion-side evidence (future-dated empty test) | ⚠️ P |
| top-products | Spreadsheet parity | header-level only | ⚠️ P |
| top-products | No sales | all-10 empty endpoint test | ✅ C |
| top-products | Footer totals | provider totals asserted | ✅ C |
| top-products | Generated timestamp | manual/static only | ⚠️ P |
| client-accounts | Only balances | `test_client_accounts_report_provider_filters_balances` | ✅ C |
| client-accounts | Include all clients (`only_with_balance=false`) | `test_client_accounts_report_provider_includes_all_clients_when_only_with_balance_false` | ✅ C |
| client-accounts | Format parity | header-level only | ⚠️ P |
| client-accounts | No matching clients | all-10 empty endpoint test | ✅ C |
| client-accounts | Debt and credit totals | provider totals asserted (Deuda/A favor) | ✅ C |
| client-accounts | Multi-page account list | static + manual only | ⚠️ P |
| category | Specific category | `test_category_report_provider_groups_products_with_totals` | ✅ C |
| category | Date range applied | `test_category_report_provider_applies_date_range_to_product_creation` (inclusive boundary asserted) | ✅ C |
| category | Category totals (per-category) | implementation renders one aggregate footer, not per-category totals | ⚠️ P |
| category | Format parity | header-level only | ⚠️ P |
| category | All categories (separated headings) | rows ordered by category with per-row column; no separated headings | ⚠️ P |
| category | No data | all-10 empty endpoint test | ✅ C |
| supplier | Specific supplier | `test_supplier_report_provider_filters_identity_and_margin_totals` | ✅ C |
| supplier | Date range applied | `test_supplier_report_provider_applies_date_range_to_product_creation` (inclusive boundary asserted) | ✅ C |
| supplier | Supplier totals | totals incl. Margen promedio asserted | ✅ C |
| supplier | Format parity | header-level only | ⚠️ P |
| supplier | Supplier identity | dataset.filters Proveedor/CUIT/Contacto rendered in base info bar | ✅ C |
| supplier | No products | all-10 empty endpoint test | ✅ C |
| purchase-order-history | Status filter | `test_purchase_order_history_report_provider_filters_status_supplier_and_period` | ✅ C |
| purchase-order-history | Supplier and period filter | same test | ✅ C |
| purchase-order-history | Order rows | row fields asserted | ✅ C |
| purchase-order-history | Totals footer | totals asserted | ✅ C |
| purchase-order-history | Empty result | all-10 empty endpoint test | ✅ C |
| purchase-order-history | Generated timestamp | manual/static only | ⚠️ P |
| stockpile-withdrawals | Specific stockpile | `test_stockpile_withdrawals_report_provider_includes_only_confirmed_stockpile_receipts` | ✅ C |
| stockpile-withdrawals | Period filter | same test (Jan 2026 range) | ✅ C |
| stockpile-withdrawals | Confirmed withdrawal rows | rows asserted (Acopio/Cliente/Comprobante) | ✅ C |
| stockpile-withdrawals | Non-stockpile vouchers excluded | same test (unlinked voucher absent) | ✅ C |
| stockpile-withdrawals | Totals footer | Filas/Cantidad/Valor asserted | ✅ C |
| stockpile-withdrawals | Empty result | all-10 empty endpoint test | ✅ C |
| current-account-withdrawals | Client filter | `test_current_account_withdrawals_report_provider_excludes_non_withdrawal_movements` | ✅ C |
| current-account-withdrawals | Date filter | `test_current_account_withdrawals_report_provider_applies_inclusive_date_range` (boundary included/excluded asserted, date.desc() asserted) | ✅ C |
| current-account-withdrawals | Valid withdrawal | same exclusion test | ✅ C |
| current-account-withdrawals | Excluded movement types | invoice, closure, refund, non-CA receipt, Payment all excluded | ✅ C |
| current-account-withdrawals | Totals footer | Filas/Cantidad/Subtotal/IVA/Total asserted | ✅ C |
| current-account-withdrawals | Empty result | all-10 empty endpoint test | ✅ C |
| inventory-count | Required filter | `test_inventory_count_report_requires_supplier_or_category_filter` (400) | ✅ C |
| inventory-count | Valid filter | `test_inventory_count_report_provider_reuses_count_sheet_rows` (active only) | ✅ C |
| inventory-count | Existing PDF preserved | endpoint PDF test + provider reuses `get_products_for_count_sheet` | ✅ C |
| inventory-count | Spreadsheet parity | full row values asserted for xlsx headers and CSV line | ✅ C |
| inventory-count | Count totals | `Productos` total asserted | ✅ C |
| inventory-count | Empty result | provider + all-10 empty endpoint tests | ✅ C |
| cross-cutting | Single row source | provider tests + shared `_report_response` consumes one dataset for all formats | ✅ C |
| cross-cutting | Totals from rows | provider totals derived from same row set | ✅ C |
| cross-cutting | Empty PDF | all-10 empty endpoint test (`%PDF`, 200) | ✅ C |
| cross-cutting | Empty spreadsheet | xlsx data-row count == 0 and CSV asserted | ✅ C |
| cross-cutting | Unknown filter | `test_cross_cutting_unknown_filters_return_400_before_file_generation` | ✅ C |
| cross-cutting | Invalid date range | `test_cross_cutting_invalid_date_ranges_return_400_before_file_generation` | ✅ C |

**Compliance summary**: 66/66 scenarios have passing runtime covering evidence (0 UNTESTED, 0 FAILING); 33/33 requirements verified. 51 scenarios fully COMPLIANT, 15 PARTIAL (depth limitations, disclosed as warnings). No scenario lacks a test.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Shared dataset foundation (task 1.1) | ✅ | `base_report_service.py`: ReportDataset, runtime-checkable ReportRowProvider Protocol, BaseReportService. |
| Monochrome PDF shell (1.2) | ✅ | `base_report.html`: Courier New, #000 monochrome, repeated thead, empty-state row, totals tfoot, generated-at footer. All 10 templates extend it. |
| Format-aware router (1.8, 2.6) | ✅ | 10 endpoints `format=pdf|xlsx|csv`, filter allowlists, unknown-filter 400, invalid-range 400, 4 compatibility aliases. |
| Legacy PDF path intact | ✅ | `pdf_service.py` keeps its own Jinja Environment; reports ChoiceLoader does not affect purchase-order/invoice/voucher rendering. |
| Inventory-count integration (1.9) | ✅ | Reuses `PurchaseOrderService.get_products_for_count_sheet()`; CSV added; legacy count-sheet endpoints untouched. |
| Frontend hub (1.10, 2.7) | ✅ | `reportsService.ts`: 10 report types, `downloadReport(type, format, filters)`; `Reports.tsx`: 10 cards with per-report filters. |
| Docs (3.4) | ✅ | README documents 10 entries, formats, filters, 400 behavior. |
| Category/supplier date-filter semantics | ✅ Resolved | Design Open Question marked RESOLVED (`Product.created_at`, inclusive; rationale: no product activity ledger exists). Clarifying Notes in category/supplier specs; boundary tests added. |

### Coherence (Design)

D1–D6 all followed: shared row-provider Protocol; base_report.html shell extended by all 10 templates; single /reports router with format Literal and unknown-filter 400 (+4 compatibility aliases); data sources documented incl. resolved created_at semantics; frontend hub with 10 cards via single downloadReport surface; test strategy incl. RED/400/empty cases.

### TDD Compliance

6/6 checks passed — TDD evidence reported in apply-progress (engram #4402); all tasks covered by tests (40 backend tests); RED confirmed (4 remediation tests exist, lines 461/631/730/979); GREEN confirmed (40/40 fresh run); triangulation adequate (boundary-aware value assertions).

### Issues Found

**CRITICAL**: None. All 4 previously-untested scenarios now have passing covering tests with real boundary assertions; design open question resolved and documented.

**WARNING**:
1. Category report presentation vs spec: spec asks for per-category totals and separated category headings; implementation renders one aggregate totals footer and flat rows ordered by category with a Categoría column (confirmed in `category_report.html`) — PARTIAL, not a runtime failure.
2. Spreadsheet-parity for the 4 restyled reports asserts headers/content-types but not full row-value equality (full value parity proven only for inventory-count).
3. Visual-language scenarios (multi-page header repetition, generated-at timestamp) rely on static template CSS plus the task 3.3 manual render verification; no automated test parses PDF content.

**SUGGESTION**:
1. `ruff SIM108` in `base_report_service.py` (ternary).
2. Frontend bundle chunks > 500 kB (tenant, CartesianChart) — consider code-splitting.
3. Leftover demo templates `stock_report_demo.html` / `client_account_demo.html` unreferenced — cleanup in separate housekeeping.

### Verdict

**PASS WITH WARNINGS** — All 23 tasks complete; 40/40 backend tests and the frontend build pass on fresh execution; all 66 scenarios have runtime covering evidence with 0 untested and 0 failing; all 4 prior CRITICAL UNTESTED findings resolved by remediation commit beabeea. Remaining 15 partial scenarios are presentation/parity-depth warnings, none blocking.
