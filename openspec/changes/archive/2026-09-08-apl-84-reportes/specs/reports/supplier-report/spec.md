# Reports Supplier Report Specification

## Purpose

The supplier report supports purchasing analysis by listing products grouped or filtered by supplier, with product pricing, stock, and margin totals.

## Requirements

### Requirement: Supplier grouping and filters

The system shall list products grouped by supplier with totals and support filtering by date range and supplier.

#### Scenario: Specific supplier
- GIVEN products exist for multiple suppliers
- WHEN the report is requested with `supplier_id`
- THEN only that supplier and its products are included

#### Scenario: Date range applied
- GIVEN product activity exists inside and outside a date range
- WHEN `date_from` and `date_to` are provided
- THEN totals are calculated for the selected range

Note: no product activity ledger exists, so `date_from`/`date_to` filter on the product creation date (`Product.created_at`) inclusively.

### Requirement: Supplier report outputs

The system shall make the supplier report available as PDF, Excel, and CSV with matching rows.

#### Scenario: Supplier totals
- GIVEN supplier product rows are generated
- WHEN the PDF is rendered
- THEN the footer shows numeric totals for product count, stock, stock value, and average margin

#### Scenario: Format parity
- GIVEN the same supplier filters
- WHEN PDF, Excel, and CSV are generated
- THEN spreadsheet rows match the PDF table rows

### Requirement: Supplier PDF presentation

The system shall render the supplier PDF in the new monochrome Courier New visual language with bordered info bar, repeated headers, single numeric total footer row, and generated-at footer.

#### Scenario: Supplier identity
- GIVEN a supplier filter is selected
- WHEN the PDF is rendered
- THEN the info bar includes supplier name, CUIT when available, and contact details when available

#### Scenario: No products
- GIVEN no products match the selected supplier filters
- WHEN the report is generated
- THEN an empty table and zero totals are returned
