# Reports Purchase Order History Report Specification

## Purpose

The purchase-order history report lists generated purchase orders for operational review, filtered by period, supplier, and order status.

## Requirements

### Requirement: Purchase-order history filters

The system shall list purchase orders filtered by date range, supplier, and status.

#### Scenario: Status filter
- GIVEN draft and confirmed purchase orders exist
- WHEN the report is requested with a status filter
- THEN only orders in that status are included

#### Scenario: Supplier and period filter
- GIVEN orders exist for multiple suppliers and dates
- WHEN supplier and date filters are provided
- THEN only matching orders are included

### Requirement: Purchase-order history outputs

The system shall make the purchase-order history report available as PDF, Excel, and CSV with matching rows.

#### Scenario: Order rows
- GIVEN matching purchase orders exist
- WHEN the report is generated
- THEN each row includes order number, date, supplier, category, item count, status, subtotal, VAT, and total

#### Scenario: Totals footer
- GIVEN order rows are generated
- WHEN the PDF is rendered
- THEN the footer row shows numeric totals for order count, item count, subtotal, VAT, and total

### Requirement: Purchase-order history PDF presentation

The system shall render the PDF in the new monochrome Courier New visual language with bordered info bar, repeated headers, single total footer row, and generated-at footer.

#### Scenario: Empty result
- GIVEN no purchase orders match the filters
- WHEN the report is generated
- THEN an empty table and zero totals are shown

#### Scenario: Generated timestamp
- GIVEN any PDF generation
- WHEN the PDF is downloaded
- THEN the footer includes generation date and time
