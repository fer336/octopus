## Exploration: apl-84-reportes

### Current State
OpenSpec context could not be read because `openspec/config.yaml` and `openspec/specs/` were absent in the working tree before this phase; the requested change folder was created only to persist this exploration.

Reports currently expose four PDF endpoints in `backend/app/routers/reports.py`: stock, sales, top products, and client accounts. Each endpoint builds a small filter schema from query params, calls one service under `backend/app/services/reporting/`, and returns a `StreamingResponse` with PDF bytes rendered by `ReportPdfService` from `backend/app/templates/pdf/reports/`.

The four existing report templates use an older blue/Arial style: colored headings, blue table headers, gray borders, summary panels, and minimal/no reusable header/footer structure. By contrast, `backend/app/templates/pdf/purchase_order.html` uses the desired monochrome visual language: Courier New, black-only borders/text, compact business header, right-aligned document title/meta, bordered info bar, bordered item table with repeated headers, single total footer row, notes box, and simple generated-at footer. `backend/app/templates/pdf/inventory_count.html` already follows a very similar monochrome style and is a useful second reference.

Inventory count PDF/Excel already exists under `/purchase-orders/inventory-count/pdf` and `/purchase-orders/inventory-count/excel`, implemented in `backend/app/routers/purchase_orders.py` and `PdfService.generate_inventory_count_pdf/generate_inventory_count_excel`. It is not integrated into the Reportes hub.

Excel/CSV export exists generically in `backend/app/services/export_service.py` (`ExportService.to_excel`, `to_csv`, content-type map), with a working route pattern in `backend/app/routers/profitability.py`. Report services do not currently expose reusable tabular data methods, so PDF generation owns query + row-shaping inline.

### Affected Areas
- `backend/app/templates/pdf/reports/stock_report.html` — restyle from blue/Arial report layout to purchase-order monochrome layout.
- `backend/app/templates/pdf/reports/sales_report.html` — restyle and likely expand sales details if acceptance expects report parity beyond current minimal rows.
- `backend/app/templates/pdf/reports/products_report.html` — restyle top-products report to shared monochrome table/header/footer language.
- `backend/app/templates/pdf/reports/accounts_report.html` — restyle account balances report while preserving debt/favor semantics in monochrome-safe form.
- `backend/app/templates/pdf/purchase_order.html` — reference design; styles/header/table/footer should be extracted or mirrored, not functionally changed.
- `backend/app/templates/pdf/inventory_count.html` — already close to target; use as reference for inventory count hub integration.
- `backend/app/services/reporting/report_pdf_service.py` — likely place for shared report template rendering only; may need a shared context convention or base template.
- `backend/app/services/reporting/stock_report_service.py` — existing data source for stock; should expose rows for PDF and Excel/CSV.
- `backend/app/services/reporting/sales_report_service.py` — existing sales data source via `Voucher`; should expose rows for PDF and Excel/CSV.
- `backend/app/services/reporting/top_products_report_service.py` — existing top-products data source via `VoucherItem` joined to confirmed sales vouchers.
- `backend/app/services/reporting/client_accounts_report_service.py` — existing account balances source via `Client.current_balance`.
- `backend/app/schemas/report_schemas.py` — add filter schemas for category, supplier, purchase-order history, stockpile withdrawals, current-account withdrawals, and export format handling.
- `backend/app/routers/reports.py` — add new report endpoints and Excel/CSV endpoints; possibly proxy inventory-count exports for hub consistency.
- `backend/app/services/export_service.py` — reuse for report Excel/CSV output; may need UTF-8 BOM/filename improvements if CSV opens in Excel for Spanish labels.
- `backend/app/models/product.py`, `category.py`, `supplier.py` — data sources for category and supplier reports.
- `backend/app/models/purchase_order.py`, `backend/app/services/purchase_order_service.py` — data sources for purchase-order history and details.
- `backend/app/models/stockpile.py`, `backend/app/services/stockpile_service.py` — data sources for stockpile withdrawal reports; child withdrawals are represented by vouchers linked through `Voucher.stockpile_id`.
- `backend/app/models/voucher.py`, `backend/app/services/voucher_service.py` — data sources for current-account withdrawal reports via confirmed receipt vouchers with `is_current_account=True` and item rows.
- `backend/app/tests/test_reports_pdf.py` — current integration pattern for PDF responses; should expand to new reports and export formats.
- `frontend/src/api/reportsService.ts` — currently supports only four PDF downloads and period mapping; needs report type expansion and format-aware downloads.
- `frontend/src/pages/Reports.tsx` — currently four static cards, one period selector, PDF-only export, and a “Próximamente” Excel note; needs dynamic filters and inventory-count hub access.
- `frontend/src/api/purchaseOrdersService.ts` — existing inventory-count PDF/Excel download methods that the Reportes hub can reuse or route through reports.

### Approaches
1. **Single comprehensive report rebuild** — Restyle existing templates, add all missing report services/routes/templates, add Excel/CSV exports, and update the frontend hub in one delivery.
   - Pros: Delivers the complete Linear acceptance in one coordinated change; avoids temporary UX mismatch.
   - Cons: High regression and review risk; many backend queries, templates, routes, and frontend states change together.
   - Effort: High

2. **Phased PRs: shared report foundation first, then coverage** — First extract/mirror the purchase-order visual language into a shared report template/context pattern and restyle the four existing reports plus inventory-count hub entry. Then add new report types and exports in small vertical slices.
   - Pros: Reduces visual duplication before adding five new data surfaces; keeps each PR reviewable; lowers risk around data-heavy queries.
   - Cons: Acceptance is not fully complete until later slices; requires coordination so frontend does not expose unfinished reports.
   - Effort: Medium per slice, High overall

3. **Route/export layer first, visual restyle last** — Add a generic `/reports/{type}/{format}` export layer and row-provider methods, then convert templates after data coverage is complete.
   - Pros: Creates a clean export contract early; Excel/CSV reuse becomes straightforward.
   - Cons: Delays the main visual acceptance; may force rework if template needs reshape row contracts.
   - Effort: Medium

### Recommendation
Use approach 2. Start with a shared monochrome report foundation and restyle the existing four reports, because the purchase-order/inventory-count templates already show the target language and the current report templates duplicate old styling. Then add report coverage as vertical slices: category + supplier from `Product` relationships, purchase-order history from `PurchaseOrder`, stockpile withdrawals from `Voucher.stockpile_id`, and current-account withdrawals from confirmed receipt vouchers with `is_current_account=True`. In each slice, expose the same row-shaping method to PDF and Excel/CSV to avoid query drift.

The proposal should explicitly resolve the issue-count ambiguity: the Linear text lists four existing reports plus five new reports plus inventory-count integration, while acceptance says “8 report types”. This needs normalization before spec/design so implementation does not accidentally miss or overbuild a report.

### Risks
- OpenSpec workspace files are absent in this checkout, so downstream SDD phases may need to create or restore `openspec/config.yaml` and main specs before continuing normally.
- Current PDF services combine querying and PDF context building, so adding Excel/CSV without shared row-provider methods can duplicate business logic and drift.
- Stockpile withdrawals are not stored as a dedicated withdrawal table; they must be inferred from confirmed receipt vouchers linked by `Voucher.stockpile_id`, including negative return rows.
- Current-account withdrawal reporting must distinguish ordinary account receipts, closure vouchers (`is_current_account_closure`), paid invoices, and payment receipts to avoid double-counting.
- The frontend Reports page has only a global period selector and static four-card model; new required filters will need a real dynamic form, not just more cards.

### Ready for Proposal
Yes, with one caveat: the orchestrator should report that code exploration is sufficient, but OpenSpec base files were missing and the proposal must clarify the “8 report types” acceptance mismatch before final scoping.
