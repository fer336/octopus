# Reports Category Report Specification

## Purpose

The category report analyzes products grouped by category with per-category and overall totals, supporting printable and spreadsheet outputs from the Reports hub.

## Requirements

### Requirement: Category grouping and filters

The system shall list products grouped by category with totals and support filtering by date range and category.

#### Scenario: Specific category
- GIVEN products belong to multiple categories
- WHEN the report is requested for one category
- THEN only that category group and its products are included

#### Scenario: Date range applied
- GIVEN product activity exists inside and outside a date range
- WHEN `date_from` and `date_to` are provided
- THEN the report totals are calculated for the selected range

Note: no product activity ledger exists, so `date_from`/`date_to` filter on the product creation date (`Product.created_at`) inclusively.

### Requirement: Category report outputs

The system shall make the category report available as PDF, Excel, and CSV with matching rows.

#### Scenario: Category totals
- GIVEN grouped category rows are generated
- WHEN the PDF is rendered
- THEN each category shows numeric product count, stock total, and stock value totals

#### Scenario: Format parity
- GIVEN the same category filters
- WHEN Excel and CSV are generated
- THEN both contain the same product rows as the PDF table

### Requirement: Category PDF presentation

The system shall render the category PDF in the new monochrome Courier New visual language with bordered info bar, repeated headers, single numeric total footer row, and generated-at footer.

#### Scenario: All categories
- GIVEN no category filter is provided
- WHEN the PDF is generated
- THEN products are grouped under clearly separated category headings

#### Scenario: No data
- GIVEN no products match the filters
- WHEN the report is generated
- THEN an empty table and zero total footer are shown
