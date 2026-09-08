# Reports Current Account Withdrawals Report Specification

## Purpose

The current-account withdrawals report lists merchandise withdrawn through current-account receipt vouchers, excluding payments, refunds, closures, and non-withdrawal movements.

## Requirements

### Requirement: Current-account withdrawal filters

The system shall list current-account withdrawal voucher items filtered by date range and client.

#### Scenario: Client filter
- GIVEN current-account withdrawals exist for multiple clients
- WHEN the report is requested with `client_id`
- THEN only rows for that client account are included

#### Scenario: Date filter
- GIVEN withdrawals exist across different dates
- WHEN `date_from` and `date_to` are provided
- THEN only voucher items in that inclusive period are included

### Requirement: Withdrawal-only inclusion

The system shall include voucher items where the voucher is a current-account withdrawal and shall exclude payment, refund, closure, and non-current-account vouchers.

#### Scenario: Valid withdrawal
- GIVEN a confirmed receipt voucher has `is_current_account` true and item rows
- WHEN the report is generated
- THEN its item rows are included with quantity and value

#### Scenario: Excluded movement types
- GIVEN payments, refunds, closures, invoices, or non-current-account receipts exist
- WHEN the report is generated
- THEN those movements are not counted as withdrawals

### Requirement: Current-account withdrawal outputs

The system shall provide PDF, Excel, and CSV outputs with the same rows, numeric footer totals, and generated-at footer.

#### Scenario: Totals footer
- GIVEN withdrawal rows are generated
- WHEN the PDF is rendered
- THEN the footer shows row count, total quantity, subtotal, VAT, and total value

#### Scenario: Empty result
- GIVEN no withdrawals match the filters
- WHEN any format is generated
- THEN an empty table and zero totals are returned

### Requirement: Client-grouped tree rendering in PDF

The system shall render the PDF grouped by billing client with a client header row, indented voucher rows, and a per-client subtotal row with quantity, subtotal, VAT, and total, while Excel and CSV exports keep the flat row order.

#### Scenario: Client hierarchy in PDF
- GIVEN withdrawals exist for multiple billing clients
- WHEN the PDF is rendered
- THEN clients appear ordered by name ascending with their voucher rows indented beneath the client header and a per-client subtotal with quantity, subtotal, VAT, and total before the grand totals footer

#### Scenario: Single-voucher client keeps the tree
- GIVEN a billing client has only one withdrawal voucher
- WHEN the PDF is rendered
- THEN the client header, voucher row, and subtotal row are still rendered for that client

#### Scenario: Flat exports unchanged
- GIVEN the PDF renders client groups
- WHEN Excel or CSV is generated
- THEN the export keeps the same flat headers and rows without group headers or subtotals
