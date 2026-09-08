# Reports Sales Report Specification

## Purpose

The sales report summarizes confirmed sales activity over a period and must remain backward-compatible while adding export formats and the unified monochrome PDF style.

## Requirements

### Requirement: Backward-compatible sales filters

The system shall preserve the current sales report filters: `date_from`, `date_to`, and `include_receipts`.

#### Scenario: Period filter
- GIVEN confirmed vouchers exist inside and outside a date range
- WHEN the sales report is requested with `date_from` and `date_to`
- THEN only vouchers in that inclusive range are included

#### Scenario: Receipt toggle
- GIVEN invoices and receipt vouchers exist
- WHEN `include_receipts` is false
- THEN receipt vouchers are excluded while invoices remain included

### Requirement: Sales report outputs

The system shall make the sales report available as PDF, Excel, and CSV using the same rows and totals.

#### Scenario: Format parity
- GIVEN a sales report request
- WHEN PDF, Excel, and CSV are generated
- THEN all formats represent the same voucher rows

#### Scenario: Empty period
- GIVEN no sales match the selected filters
- WHEN the report is generated
- THEN the output contains an empty table and zero totals without crashing

### Requirement: Sales PDF visual language

The system shall render the sales PDF using `purchase_order.html` visual language: monochrome, Courier New, bordered info bar, repeated table headers, a single total footer row, and generated-at footer.

#### Scenario: Totals row
- GIVEN sales rows are present
- WHEN the PDF is rendered
- THEN the table footer shows numeric totals for voucher count, subtotal, VAT, and total

#### Scenario: Multi-page sales list
- GIVEN the sales list spans more than one page
- WHEN the PDF is rendered
- THEN the table header repeats on each page
