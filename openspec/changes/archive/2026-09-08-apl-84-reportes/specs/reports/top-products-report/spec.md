# Reports Top Products Report Specification

## Purpose

The top-products report ranks products sold in a period and must keep its current filters while becoming available in PDF, Excel, and CSV with a consistent report style.

## Requirements

### Requirement: Backward-compatible top-products filters

The system shall preserve the current top-products filters: `date_from`, `date_to`, and `limit`.

#### Scenario: Limit respected
- GIVEN more sold products exist than the requested limit
- WHEN the report is generated with `limit`
- THEN only up to that number of ranked rows is included

#### Scenario: Inclusive date range
- GIVEN sold products exist inside and outside a period
- WHEN `date_from` and `date_to` are provided
- THEN totals and ranking are calculated only from matching vouchers

### Requirement: Top-products report outputs

The system shall make the top-products report available as PDF, Excel, and CSV using the same rows and totals.

#### Scenario: Spreadsheet parity
- GIVEN a top-products report request
- WHEN Excel and CSV are generated
- THEN both contain the same product rows and ordering as the PDF table

#### Scenario: No sales
- GIVEN no matching sales exist
- WHEN the report is generated
- THEN the output contains an empty table and zero quantity and amount totals

### Requirement: Top-products PDF visual language

The system shall render the top-products PDF using `purchase_order.html` visual language: monochrome, Courier New, bordered info bar, repeated table headers, a single total footer row, and generated-at footer.

#### Scenario: Footer totals
- GIVEN ranked product rows are generated
- WHEN the PDF is rendered
- THEN the footer row shows numeric totals for rows, quantity, amount, and voucher count

#### Scenario: Generated timestamp
- GIVEN any PDF generation
- WHEN the user opens the PDF
- THEN the footer displays the generation date and time
