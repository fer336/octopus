# Reports Client Accounts Report Specification

## Purpose

The client-accounts report lists current-account balances by client and must keep existing behavior while adding spreadsheet exports and the new monochrome PDF presentation.

## Requirements

### Requirement: Backward-compatible account filters

The system shall preserve the current client-accounts report filter: `only_with_balance`.

#### Scenario: Only balances
- GIVEN clients exist with positive, negative, and zero balances
- WHEN `only_with_balance` is true
- THEN clients with zero balance are excluded

#### Scenario: Include all clients
- GIVEN clients exist with any balance
- WHEN `only_with_balance` is false
- THEN all non-deleted clients are included

### Requirement: Client-accounts report outputs

The system shall make the client-accounts report available as PDF, Excel, and CSV using the same rows and totals.

#### Scenario: Format parity
- GIVEN an accounts report request
- WHEN PDF, Excel, and CSV are generated
- THEN each format includes the same client rows

#### Scenario: No matching clients
- GIVEN no clients match the filter
- WHEN the report is generated
- THEN the output contains an empty table and zero totals without crashing

### Requirement: Client-accounts PDF visual language

The system shall render the accounts PDF using `purchase_order.html` visual language: monochrome, Courier New, bordered info bar, repeated table headers, a single total footer row, and generated-at footer.

#### Scenario: Debt and credit totals
- GIVEN client balance rows exist
- WHEN the PDF is rendered
- THEN the footer row shows numeric totals for clients, debt balance, and credit balance

#### Scenario: Multi-page account list
- GIVEN the account list spans more than one page
- WHEN the PDF is rendered
- THEN table headers repeat on every page
