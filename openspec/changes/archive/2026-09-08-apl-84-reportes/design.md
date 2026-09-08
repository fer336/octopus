# Design: APL-84 Reports

## Context
The Reports hub must expose 10 printable/exportable entries, restyle the 4 existing PDFs to the monochrome `purchase_order.html`/`inventory_count.html` language, add 5 missing report types, and surface existing inventory-count exports without changing the purchase-order workflow. OpenSpec base config/specs are absent; this design uses the change-local proposal/specs as authority.

## Architecture Overview
`reports.py` remains the single report entry point. Data must flow once from row providers into every format:

```text
FastAPI /reports/* ──filters──> ReportRowProvider
       │                         │ rows, headers, totals, meta
       ├── format=pdf  ─────────> ReportPdfService + Jinja templates
       └── format=xlsx|csv ─────> ExportService
```

## Key Design Decisions

### Decision 1: Shared row provider pattern
Use a small `ReportRowProvider` `Protocol`, not an inheritance-heavy base class; shared helpers live in `base_report_service.py`.

```python
class ReportDataset(TypedDict):
    title: str; headers: list[str]; rows: list[dict[str, Any]]
    totals: dict[str, Any]; filters: dict[str, Any]; orientation: Literal["portrait", "landscape"]

class ReportRowProvider(Protocol):
    async def build_dataset(self, business_id: UUID, filters: BaseModel, generated_by: str | None = None) -> ReportDataset: ...
```

All 10 reports implement `build_dataset()`. `generate_pdf()` becomes a thin wrapper around the dataset, so PDF/XLSX/CSV cannot drift.

### Decision 2: Visual language template
Create `backend/app/templates/pdf/reports/base_report.html` and have every report template extend it. This is preferable to copying blocks because the target style has repeated header/footer/table behavior across 10 outputs; one base keeps Courier New, monochrome borders, repeated `thead`, row break rules, info bar, empty-state row, and footer consistent.

### Decision 3: Router structure
Use one `/reports` router and one endpoint per hub entry with `format: Literal["pdf","xlsx","csv"] = "pdf"`. Keep existing `/stock/pdf`, `/sales/pdf`, `/products/pdf`, `/accounts/pdf` as compatibility aliases only if needed by current tests/clients.

```python
GET /reports/stock
GET /reports/sales
GET /reports/top-products
GET /reports/client-accounts
GET /reports/category
GET /reports/supplier
GET /reports/purchase-order-history
GET /reports/stockpile-withdrawals
GET /reports/current-account-withdrawals
GET /reports/inventory-count
```

Each handler builds the Pydantic filter schema, calls the provider, then `_report_response(dataset, format, filename_prefix)`. Unknown query parameters must return 400 by comparing `request.query_params` against the report allowlist plus `format`.

### Decision 4: New report data sources
| Report | Models/query | Filters | Headers | Totals |
|---|---|---|---|---|
| Category | `Product` + `Category` + `Supplier` + `ProductLot`, grouped by category | `category_id`, optional `date_from/date_to` filtering by `Product.created_at` (inclusive range; resolved open question — no product activity ledger exists, so creation date is the only timestamped product source) | Category, Code, Description, Supplier, Stock, Sale price, Stock value | categories, products, units, stock_value |
| Supplier | `Product` + `Supplier` + `Category` + lots | `supplier_id`, `date_from/date_to` filtering by `Product.created_at` (inclusive range; same resolved semantics as category) | Supplier, CUIT, Code, Description, Category, Stock, List price, Discounts, Cost, Sale price, Margin % | suppliers/products, stock, stock_value, avg_margin |
| Purchase-order history | `PurchaseOrder` + `PurchaseOrderItem` + supplier/category | `date_from`, `date_to`, `supplier_id`, `status` | Number, Date, Supplier, Category, Items, Status, Subtotal, VAT, Total | orders, items, subtotal, vat, total |
| Stockpile withdrawals | `Voucher`/`VoucherItem` joined to `Stockpile` and clients where confirmed receipt and `Voucher.stockpile_id IS NOT NULL` | `date_from`, `date_to`, `stockpile_id` | Date, Stockpile, Client, Voucher, Code, Product, Qty, Total | rows, quantity, value |
| Current-account withdrawals | `Voucher`/`VoucherItem` and clients where confirmed receipt, `is_current_account=true`, `is_current_account_closure=false`, `is_return_receipt=false`, `stockpile_id IS NULL` | `date_from`, `date_to`, `client_id` | Date, Billing client, Withdrawal client, Voucher, Code, Product, Qty, Subtotal, VAT, Total | rows, quantity, subtotal, vat, total |
| Inventory count | reuse `PurchaseOrderService.get_products_for_count_sheet()`; add CSV through report row provider | `supplier_id` or `category_id` required | Code, Description, Category, Supplier, System stock, Physical count, To order | products |

### Decision 5: Frontend hub
Update `Reports.tsx` from 4 static PDF cards to 10 card definitions. Each card owns a compact filter form and three download buttons: PDF, Excel, CSV. `reportsService.ts` should expose `downloadReport(type, format, filters)` and map camelCase UI filter names to API query names. Inventory count can call `/reports/inventory-count?format=...` so the hub has one API surface.

### Decision 6: Test strategy
Add unit tests for each provider's filters, row count, totals, and empty rows. Expand `test_reports_pdf.py` into PDF endpoint coverage for every report (`%PDF` magic bytes). Add XLSX integration tests with `openpyxl` header/row assertions and CSV content-type/header assertions. RED cases: invalid date range and unknown filter return 400; inventory count without supplier/category returns 400; empty valid filters return downloadable files, not 404.

## File-by-file change list
| File | Action | Description |
|---|---|---|
| `backend/app/services/reporting/base_report_service.py` | Create | `ReportDataset`, `ReportRowProvider`, business/meta/format helpers. |
| `backend/app/services/reporting/*_report_service.py` | Modify/Create | Existing 4 gain `build_dataset`; new 6 providers added. |
| `backend/app/services/reporting/report_pdf_service.py` | Modify | Render dataset through shared context/base template. |
| `backend/app/templates/pdf/reports/base_report.html` | Create | Shared monochrome report shell. |
| `backend/app/templates/pdf/reports/*.html` | Modify/Create | Existing 4 restyled; new report body blocks added. |
| `backend/app/routers/reports.py` | Modify | Format-aware 10 endpoints, validation, shared responses. |
| `backend/app/schemas/report_schemas.py` | Modify | New filters and `ReportFormat`. |
| `backend/app/services/export_service.py` | Modify | Header-order support and empty CSV/XLSX headers. |
| `frontend/src/api/reportsService.ts` | Modify | 10 report types, filters, format-aware downloads. |
| `frontend/src/pages/Reports.tsx` | Modify | 10-card hub with per-report filters and buttons. |
| `backend/app/tests/test_reports_pdf.py` | Modify | Existing and new PDF/export tests. |

## Threat Matrix
API route expansion only; no shell/process/VCS boundaries. Matrix rows from `references/threat-matrix.md`: Documentation-like paths N/A, Git repository selection N/A, Commit state N/A, Push state N/A, PR commands N/A. API-specific safe behavior is 400 for unknown/invalid filters and no file generation.

## Migration / Rollout
Phase 1: foundation, restyle 4 existing reports, inventory-count hub integration. Phase 2: category, supplier, purchase-order history, stockpile withdrawals, current-account withdrawals. Phase 3: tests and acceptance. No database migration required.

## Open Questions
- [x] Should category/supplier `date_from/date_to` remain metadata-only until a product activity source is defined, or should they filter by `Product.created_at`?
  - **RESOLVED**: They filter by `Product.created_at` with an inclusive range. No product activity ledger exists in the data model, so creation date is the only timestamped product source; keeping the filters as metadata-only would leave them as silent no-ops. This semantics is documented in the category/supplier specs and covered by tests in `backend/app/tests/test_reports_pdf.py`.
