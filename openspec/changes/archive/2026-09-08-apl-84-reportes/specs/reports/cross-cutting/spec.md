# Reports Cross-Cutting Specification

## Purpose

Cross-cutting report behavior keeps PDF and spreadsheet exports consistent, validates filter contracts, and prevents report generation failures from empty datasets.

## Requirements

### Requirement: Shared row providers

The system shall use a shared row-provider pattern where report services return `list[dict]` rows consumed by PDF, Excel, and CSV generation.

#### Scenario: Single row source
- GIVEN any report type is requested in multiple formats
- WHEN the service resolves the filtered data
- THEN the same `list[dict]` row set is used for PDF, Excel, and CSV

#### Scenario: Totals from rows
- GIVEN report rows are produced
- WHEN footer totals are calculated
- THEN the totals are derived from the same row set used for exports

### Requirement: Empty data handling

The system shall render empty report outputs as empty tables with zero totals instead of crashing.

#### Scenario: Empty PDF
- GIVEN a valid filter set matches no rows
- WHEN a PDF report is generated
- THEN the PDF contains headers, an empty table, zero totals, and generated-at footer

#### Scenario: Empty spreadsheet
- GIVEN a valid filter set matches no rows
- WHEN Excel or CSV is generated
- THEN the file is downloadable and clearly represents no rows

### Requirement: Filter validation

The system shall reject unknown filters with HTTP 400 and validate known filters before report generation.

#### Scenario: Unknown filter
- GIVEN a request includes a query parameter not accepted by that report
- WHEN the endpoint validates the request
- THEN the response is HTTP 400 with a validation message

#### Scenario: Invalid date range
- GIVEN `date_from` is later than `date_to`
- WHEN the report request is validated
- THEN the response is HTTP 400 and no report file is generated
