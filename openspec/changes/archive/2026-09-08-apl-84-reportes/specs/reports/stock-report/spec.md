# Reports Stock Report Specification

## Purpose

The stock report gives the business a printable and exportable inventory snapshot while preserving the current stock filter contract and aligning the PDF with the purchase-order visual language.

## Requirements

### Requirement: Backward-compatible stock filters

The system shall preserve the current stock report filters: `search`, `category_id`, `supplier_id`, `low_stock_only`, and `include_inactive`.

#### Scenario: Existing PDF filters still work
- GIVEN products exist across categories and suppliers
- WHEN the stock report is requested with any current filter combination
- THEN the output includes only matching rows
- AND the request remains compatible with existing query parameters

#### Scenario: No matching rows
- GIVEN the filters match no products
- WHEN the stock report is generated
- THEN the output contains an empty table with totals set to zero

### Requirement: Stock report outputs

The system shall make the stock report available as PDF, Excel, and CSV using the same row set and totals.

#### Scenario: Matching spreadsheet rows
- GIVEN a stock report request
- WHEN PDF, Excel, and CSV are generated with the same filters
- THEN Excel and CSV contain the same data rows as the PDF table

#### Scenario: Numeric footer totals
- GIVEN stock rows are generated
- WHEN the PDF is rendered
- THEN the table footer shows numeric totals for item count, units, low-stock count, and stock value

### Requirement: Stock PDF visual language

The system shall render the stock PDF using `purchase_order.html` visual language: monochrome, Courier New, bordered info bar, repeated table headers, a single total footer row, and generated-at footer.

#### Scenario: Long inventory list
- GIVEN the report spans multiple pages
- WHEN the PDF is rendered
- THEN table headers repeat on every page
- AND rows are not visually cut between pages

#### Scenario: Generated timestamp visible
- GIVEN any stock PDF generation
- WHEN the PDF is downloaded
- THEN the footer includes the generation date and time
