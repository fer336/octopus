# Reports Inventory Count Report Specification

## Purpose

The inventory-count report integrates the existing inventory count sheet into the Reports hub without changing the inventory workflow, making its PDF and spreadsheet outputs discoverable with the other reports.

## Requirements

### Requirement: Inventory count hub integration

The system shall expose inventory count as a Reports hub entry using the existing supplier and category filter behavior.

#### Scenario: Required filter
- GIVEN no supplier or category filter is selected
- WHEN the user requests the inventory count report
- THEN the system rejects the request with a validation error

#### Scenario: Valid filter
- GIVEN a supplier or category is selected
- WHEN the report is requested
- THEN the output includes active products matching the selected filters

### Requirement: Inventory count outputs

The system shall make inventory count available from the Reports hub as PDF, Excel, and CSV with matching rows.

#### Scenario: Existing PDF preserved
- GIVEN a valid inventory-count request
- WHEN PDF is generated from the Reports hub
- THEN it follows the existing inventory-count content and monochrome visual language

#### Scenario: Spreadsheet parity
- GIVEN the same inventory-count filters
- WHEN Excel and CSV are generated
- THEN both contain the same product rows as the PDF table

### Requirement: Inventory count totals and footer

The system shall include generation time in the PDF footer and numeric totals in the table footer or summary row.

#### Scenario: Count totals
- GIVEN product rows are generated
- WHEN the PDF is rendered
- THEN total product count is visible as a numeric total

#### Scenario: Empty result
- GIVEN no products match the selected filters
- WHEN the report is generated
- THEN an empty table is returned without crashing
