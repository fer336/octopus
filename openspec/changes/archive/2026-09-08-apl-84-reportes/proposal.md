# Proposal: APL-84 Reports

## Intent / Why

Create one consistent, printable, exportable Reports hub. Current report PDFs use an older blue/Arial style, required PRD reports are missing, and `ExportService` supports Excel/CSV but reports are PDF-only.

## What Changes

- Restyle stock, sales, top products, and client accounts PDFs to `purchase_order.html`: Courier New, monochrome, bordered info bar, repeated headers, one total footer row, generated-at footer.
- Add category, supplier, purchase-order history, stockpile withdrawals, current-account withdrawals, and existing inventory count to the hub.
- Export all hub entries as PDF, Excel, and CSV.
- Count discrepancy: “8 report types” is an acceptance typo; confirmed scope implies 10 hub entries.

## Scope

### In Scope
- Backend routes, schemas, services, templates, and export responses.
- Frontend report cards, dynamic filters, and format-aware downloads.
- Inventory-count hub integration.

### Out of Scope
- Email/WhatsApp delivery.
- Generated-report history.
- Purchase-order or inventory-count workflow changes beyond hub access.

## Capabilities

### New Capabilities
- `reports-hub`: 10 entries with filters/downloads.
- `report-exports`: shared row providers for PDF/Excel/CSV.

### Modified Capabilities
- None; `openspec/specs/` is absent.

## Approach

Phase 1: shared row-provider/export conventions and monochrome base template; restyle four PDFs; integrate inventory count.

Phase 2: add category, supplier, purchase-order history, stockpile withdrawals, and current-account withdrawals as vertical slices using one row source per report.

Phase 3: acceptance/tests for hub count, style, required filters, and content types.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/app/routers/reports.py` | Modified | Endpoints/export formats. |
| `backend/app/schemas/report_schemas.py` | Modified | Filters/format handling. |
| `backend/app/services/reporting/*` | Modified/New | Row providers/services. |
| `backend/app/templates/pdf/reports/*` | Modified/New | Restyle/add templates. |
| `backend/app/services/export_service.py` | Modified | Reuse/harden exports. |
| `frontend/src/pages/Reports.tsx` | Modified | Hub UI/filters. |
| `frontend/src/api/reportsService.ts` | Modified | Typed downloads. |
| `backend/app/tests/test_reports_pdf.py` | Modified | Route/export coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Current-account withdrawals double-count payments/refunds/closures. | High | Specify inclusion rules first. |
| Stockpile withdrawals are voucher-inferred. | Med | Query confirmed receipts with `Voucher.stockpile_id`. |
| PDF/spreadsheet outputs drift. | Med | Enforce shared row providers. |

## Rollback Plan

Revert report router/schema/service/template/frontend changes together and restore the previous four PDF endpoints/templates.

## Dependencies

- Product/category/supplier, voucher, purchase-order, stockpile, inventory-count, and `ExportService` infrastructure.

## Open Questions

- None for proposal; voucher inclusion rules must be formalized in specs/design.

## Success Criteria

- [ ] Hub exposes exactly 10 confirmed entries.
- [ ] Every entry downloads PDF, Excel, and CSV.
- [ ] Four existing PDFs match purchase-order monochrome style.
- [ ] New reports satisfy PRD §3.11.2, §3.11.3, and confirmed scope.
- [ ] Tests cover success, filters, and content types.
