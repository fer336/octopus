# Tasks: APL-84 Reports

## Phase 1 — Foundation + restyle 4 + integrate inventory count

- [x] 1.1 Description: Add `ReportDataset` and `ReportRowProvider` Protocol plus shared helpers for metadata, totals, and export headers. Files: `backend/app/services/reporting/base_report_service.py` (new shared row-provider contract), `backend/app/services/reporting/__init__.py` (exports). Dependencies: none. Estimate: 120 lines.
- [x] 1.2 Description: Create shared monochrome PDF shell matching purchase-order visual language: header, footer, info bar, repeated table headers, totals row, empty row. Files: `backend/app/templates/pdf/reports/base_report.html` (new base template), `backend/app/services/reporting/report_pdf_service.py` (dataset render context). Dependencies: 1.1. Estimate: 160 lines.
- [x] 1.3 Description: Refactor stock report service to build one `ReportDataset` consumed by PDF/XLSX/CSV while preserving current filters. Files: `backend/app/services/reporting/stock_report_service.py`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1. Estimate: 140 lines.
- [x] 1.4 Description: Refactor stock PDF body to extend the base template and show stock totals/empty table. Files: `backend/app/templates/pdf/reports/stock_report.html`. Dependencies: 1.2, 1.3. Estimate: 60 lines.
- [x] 1.5 Description: Refactor sales service and template to shared dataset/base-template flow, preserving `date_from`, `date_to`, `include_receipts`. Files: `backend/app/services/reporting/sales_report_service.py`, `backend/app/templates/pdf/reports/sales_report.html`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1, 1.2. Estimate: 180 lines.
- [x] 1.6 Description: Refactor top-products service and template to shared dataset/base-template flow, preserving `date_from`, `date_to`, `limit`. Files: `backend/app/services/reporting/top_products_report_service.py`, `backend/app/templates/pdf/reports/products_report.html`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1, 1.2. Estimate: 170 lines.
- [x] 1.7 Description: Refactor client-accounts service and template to shared dataset/base-template flow, preserving `only_with_balance`. Files: `backend/app/services/reporting/client_accounts_report_service.py`, `backend/app/templates/pdf/reports/accounts_report.html`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1, 1.2. Estimate: 160 lines.
- [x] 1.8 Description: Refactor report router to one endpoint per report with `format=pdf|xlsx|csv`, strict unknown-filter 400s, and compatibility aliases if needed. Files: `backend/app/routers/reports.py`, `backend/app/services/export_service.py`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.3-1.7. Estimate: 220 lines.
- [x] 1.9 Description: Integrate inventory-count into Reports hub using existing count-sheet data and PDF/Excel behavior, adding CSV and format selector route. Files: `backend/app/routers/reports.py`, `backend/app/routers/purchase_orders.py` (read-only behavior reference), `backend/app/services/reporting/inventory_count_report_service.py`, `backend/app/templates/pdf/inventory_count.html`. Dependencies: 1.1, 1.8. Estimate: 160 lines.
- [x] 1.10 Description: Expose the 5 restyled/integrated reports in frontend with per-report filters and PDF/Excel/CSV downloads. Files: `frontend/src/api/reportsService.ts`, `frontend/src/pages/Reports.tsx`. Dependencies: 1.8, 1.9. Estimate: 260 lines.
- [x] 1.11 Description: Add unit tests for 5 row providers and integration tests for PDF/XLSX/CSV of stock, sales, top-products, client-accounts, inventory-count. Files: `backend/app/tests/test_reports_pdf.py`, optional `backend/app/tests/test_report_services.py`. Dependencies: 1.3-1.9. Estimate: 450 lines.

## Phase 2 — 5 new reports

- [x] 2.1 Description: Add category report dataset service and PDF template with grouping, category totals, empty state, and format parity. Files: `backend/app/services/reporting/category_report_service.py`, `backend/app/templates/pdf/reports/category_report.html`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1, 1.2. Estimate: 180 lines.
- [x] 2.2 Description: Add supplier report dataset service and PDF template with supplier identity, pricing, margin, totals, and empty state. Files: `backend/app/services/reporting/supplier_report_service.py`, `backend/app/templates/pdf/reports/supplier_report.html`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1, 1.2. Estimate: 190 lines.
- [x] 2.3 Description: Add purchase-order history dataset service and PDF template with period/supplier/status filters and totals. Files: `backend/app/services/reporting/purchase_order_history_report_service.py`, `backend/app/templates/pdf/reports/purchase_order_history_report.html`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1, 1.2. Estimate: 180 lines.
- [x] 2.4 Description: Add stockpile withdrawals dataset service and PDF template from confirmed receipt vouchers linked to stockpiles. Files: `backend/app/services/reporting/stockpile_withdrawals_report_service.py`, `backend/app/templates/pdf/reports/stockpile_withdrawals_report.html`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1, 1.2. Estimate: 180 lines.
- [x] 2.5 Description: Add current-account withdrawals dataset service and PDF template excluding payments, refunds, closures, invoices, and non-current-account receipts. Files: `backend/app/services/reporting/current_account_withdrawals_report_service.py`, `backend/app/templates/pdf/reports/current_account_withdrawals_report.html`, `backend/app/schemas/report_schemas.py`. Dependencies: 1.1, 1.2. Estimate: 190 lines.
- [x] 2.6 Description: Wire the 5 new reports into format-aware router responses and filter allowlists. Files: `backend/app/routers/reports.py`. Dependencies: 2.1-2.5. Estimate: 140 lines.
- [x] 2.7 Description: Add 5 frontend report cards with required filters and PDF/Excel/CSV download buttons. Files: `frontend/src/pages/Reports.tsx`, `frontend/src/api/reportsService.ts`. Dependencies: 2.6. Estimate: 220 lines.
- [x] 2.8 Description: Add unit, integration, and edge-case tests for all 5 new reports, including exclusions and empty datasets. Files: `backend/app/tests/test_reports_pdf.py`, optional `backend/app/tests/test_report_services.py`. Dependencies: 2.1-2.6. Estimate: 500 lines.

## Phase 3 — Acceptance & polish

- [x] 3.1 Description: Add cross-cutting tests proving unknown filters and invalid date ranges return HTTP 400 before file generation. Files: `backend/app/tests/test_reports_pdf.py`. Dependencies: 1.8, 2.6. Estimate: 80 lines.
- [x] 3.2 Description: Add cross-cutting tests proving every valid empty result returns an empty PDF/XLSX/CSV table, not 500. Files: `backend/app/tests/test_reports_pdf.py`. Dependencies: 1.11, 2.8. Estimate: 80 lines.
- [x] 3.3 Description: Manually render all 10 PDFs and confirm Courier New, monochrome borders/text, repeated headers, footer timestamp, and totals row. Files: `backend/app/templates/pdf/reports/*.html` (read-only verification target), `backend/app/templates/pdf/inventory_count.html` (read-only verification target). Dependencies: 1.4-1.9, 2.1-2.5. Estimate: 0 lines.
- [x] 3.4 Description: Update project-facing notes for report formats, hub entries, and filter behavior. Files: `CHANGELOG.md` or `README.md` (whichever exists/contains release notes). Dependencies: 3.1-3.3. Estimate: 40 lines.

## Review Workload Forecast
- Total estimated changed lines (sum of task estimates): 4060
- Chained PRs recommended: Yes
- 800-line budget risk: High
- Decision needed before apply: Yes
- Reason: This change crosses backend routing, shared service contracts, 10 report data providers, Jinja PDF templates, spreadsheet exports, frontend hub UX, and broad test coverage. A single PR would exceed the caller-set 800-line review budget by a wide margin, so apply should stop for chained-PR or size-exception approval before implementation.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Shared dataset/export foundation plus 4 existing reports | PR 1 | `pytest backend/app/tests/test_reports_pdf.py -k "stock or sales or products or accounts"` | Generate stock/sales/top-products/client-accounts in PDF/XLSX/CSV locally | `backend/app/services/reporting/*`, `backend/app/templates/pdf/reports/*`, `backend/app/routers/reports.py` |
| 2 | Inventory-count Reports hub integration | PR 2 | `pytest backend/app/tests/test_reports_pdf.py -k inventory_count` | Download inventory-count PDF/XLSX/CSV with supplier/category filters | `inventory_count_report_service.py`, report route aliases, frontend inventory card |
| 3 | Five new backend reports | PR 3 | `pytest backend/app/tests/test_reports_pdf.py -k "category or supplier or purchase_order or stockpile or current_account"` | Download each new report in all formats with seeded data | New report services/templates/router entries |
| 4 | Frontend hub and acceptance polish | PR 4 | `npm --prefix frontend run build` | Use `/reportes` to select all 10 cards and trigger downloads | `frontend/src/pages/Reports.tsx`, `frontend/src/api/reportsService.ts`, docs |
