# Reports Stockpile Withdrawals Report Specification

## Purpose

The stockpile withdrawals report lists products withdrawn from stockpiles so the business can audit reserved-stock consumption by period and stockpile.

## Requirements

### Requirement: Stockpile withdrawal filters

The system shall list stockpile withdrawals filtered by date range and stockpile.

#### Scenario: Specific stockpile
- GIVEN withdrawals exist for multiple stockpiles
- WHEN the report is requested with a stockpile filter
- THEN only withdrawals from that stockpile are included

#### Scenario: Period filter
- GIVEN withdrawals exist inside and outside a date range
- WHEN date filters are provided
- THEN only withdrawals in the inclusive period are included

### Requirement: Stockpile withdrawal inclusion

The system shall include confirmed stockpile withdrawal voucher items with quantity and value and shall not include unrelated vouchers.

#### Scenario: Confirmed withdrawal rows
- GIVEN confirmed receipt vouchers are linked to a stockpile
- WHEN the report is generated
- THEN each voucher item appears with date, stockpile, client, voucher number, product, quantity, and value

#### Scenario: Non-stockpile vouchers excluded
- GIVEN confirmed vouchers exist without a stockpile link
- WHEN the report is generated
- THEN those voucher items are excluded

### Requirement: Stockpile withdrawal outputs

The system shall provide PDF, Excel, and CSV outputs with the same rows, numeric footer totals, and generated-at footer.

#### Scenario: Totals footer
- GIVEN withdrawal rows are generated
- WHEN the PDF is rendered
- THEN the footer shows total rows, quantity withdrawn, and value withdrawn

#### Scenario: Empty result
- GIVEN no withdrawals match
- WHEN any format is generated
- THEN an empty table is returned without crashing
