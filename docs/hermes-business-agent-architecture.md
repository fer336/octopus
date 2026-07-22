# Hermes Business Agent Architecture Plan

## Context

OctopusTrack currently has an internal AI assistant named Luci. The target architecture for the upcoming tests is to remove Luci from the product and use a dedicated Hermes Business Agent as the only AI agent for the business.

Hermes already runs on the VPS as a personal agent. The new business agent must run as an independent Hermes gateway/runtime, separated from the personal agent, and connect to OctopusTrack APIs to query and operate on business data in real time.

## Target Architecture

```text
User
  -> Telegram / WhatsApp / other Hermes gateway channel
  -> Hermes Business Agent
      -> Hermes decides which OctopusTrack tool to call
      -> OctopusTrack Hermes API Bridge
      -> Existing ERP services and PostgreSQL
```

Luci disappears from the system. Hermes owns:

- Intent handling
- Conversation flow
- Memory
- Learning loop
- Business-agent personality
- External gateway channels

OctopusTrack owns:

- Business data
- Business rules
- Authentication for service accounts
- API endpoints for Hermes tools
- Creation of quotes, vouchers, and other ERP records

## Infrastructure Decision

- Hermes Personal Agent already runs on the VPS and stays untouched.
- Hermes Business Agent runs as a separate gateway/process.
- OctopusTrack and Hermes are on the same VPS but on different networks.
- Communication is through HTTP/HTTPS API calls, authenticated with JWT service account tokens.

## Authentication

Use a dedicated Hermes service-account flow.

### New model

`backend/app/models/hermes_service_account.py`

Fields:

- `id`
- `business_id`
- `client_id`
- `hashed_secret`
- `scopes`
- `is_active`
- `created_at`
- `updated_at`
- `deleted_at`

### Auth endpoint

```http
POST /auth/hermes/token
```

Request:

```json
{
  "client_id": "...",
  "client_secret": "..."
}
```

Response:

```json
{
  "access_token": "...",
  "expires_in": 86400,
  "token_type": "bearer"
}
```

JWT claims:

- `sub`: service account client id
- `business_id`: fixed business boundary
- `type`: `service_account`
- `scopes`: allowed operations
- `exp`: expiration, initially 24h

Hermes caches the JWT and refreshes it automatically on expiration or 401 responses.

## OctopusTrack API Bridge

Add a dedicated bridge router for Hermes.

Primary files:

- `backend/app/routers/hermes_auth.py`
- `backend/app/routers/hermes_bridge.py`
- `backend/app/services/hermes_bridge_service.py`
- `backend/app/schemas/hermes_schemas.py`
- `backend/app/utils/hermes_auth.py`

### Endpoints

Health:

```http
GET /api/tenant/hermes/ping
```

Products:

```http
GET /api/tenant/hermes/products?search=&category=&page=&per_page=
GET /api/tenant/hermes/products/{id}
GET /api/tenant/hermes/products/{id}/lots
```

Stock:

```http
GET /api/tenant/hermes/stock/alerts?threshold=
GET /api/tenant/hermes/stock/stagnant?days=
```

Sales and dashboard:

```http
GET /api/tenant/hermes/sales?period=day|week|month|range&from=&to=
GET /api/tenant/hermes/dashboard
```

Clients:

```http
GET /api/tenant/hermes/clients?search=&type=&page=
GET /api/tenant/hermes/clients/{id}/account
```

Suppliers:

```http
GET /api/tenant/hermes/suppliers?search=
```

Quotes:

```http
POST /api/tenant/hermes/quotes/parse
POST /api/tenant/hermes/quotes/create
GET /api/tenant/hermes/quotes/{id}
```

Vouchers:

```http
POST /api/tenant/hermes/vouchers
```

Categories:

```http
GET /api/tenant/hermes/categories
```

## Quote Parsing Decision

Quote parsing stays in the OctopusTrack Bridge for now.

Reason:

- OctopusTrack already has business matching logic that can be migrated from Luci.
- Hermes should not need to manually orchestrate many product lookups for every quote draft.
- The Bridge can return a structured draft with matched products, ambiguous products, missing items, totals, and review flags.

Flow:

```text
Hermes receives quote request
  -> octo_parse_quote(text)
  -> POST /api/tenant/hermes/quotes/parse
  -> Bridge returns draft
  -> Hermes asks user for confirmation/corrections
  -> octo_create_quote(...)
```

## Hermes Business Agent Tools

Add a Hermes tool module:

`tools/octopus_track_tool.py`

Initial tools:

- `octo_ping()`
- `octo_search_products(search, category)`
- `octo_product_detail(id)`
- `octo_stock_alerts(threshold)`
- `octo_stagnant_products(days)`
- `octo_sales_summary(period, from_date, to_date)`
- `octo_dashboard()`
- `octo_search_clients(search, client_type)`
- `octo_client_account(client_id)`
- `octo_search_suppliers(search)`
- `octo_parse_quote(text)`
- `octo_create_quote(client_id, items, notes)`
- `octo_get_quote(id)`
- `octo_create_voucher(type, client_id, items)`

Each tool must:

- Read OctopusTrack base URL and service credentials from Hermes Business Agent config.
- Request a JWT when needed.
- Cache the JWT until expiration.
- Retry once after 401 by refreshing the token.
- Return concise, structured data suitable for LLM use.

## Hermes Skill

Add a Hermes skill:

`skills/octopus-track/SKILL.md`

Purpose:

- Define Hermes as the OctopusTrack business agent.
- Explain when to use each OctopusTrack tool.
- Require confirmation before creating business records.
- Keep business operations scoped to the authenticated tenant.

Initial behavioral rules:

- Use product search before quoting unless product ids are already known.
- Use quote parse before quote creation.
- Always ask for confirmation before creating quotes, vouchers, invoices, receipts, or destructive changes.
- Prefer real-time API data over memory for prices, stock, balances, and sales.
- Use Hermes memory only for preferences, recurring patterns, and user/business context, not as source of truth for live data.

## Luci Removal Scope

The goal is to remove Luci completely from OctopusTrack.

Candidate files/components to remove or migrate:

Backend:

- `backend/app/routers/ai.py`
- `backend/app/routers/ai_config.py`
- `backend/app/services/ai_chat_service.py`
- `backend/app/services/ai_quote_service.py`
- `backend/app/services/ai_business_tools.py`
- `backend/app/services/ai_memory_service.py`
- `backend/app/services/chat_history_service.py`
- `backend/app/services/llm_factory.py`
- `backend/app/models/ai_provider_config.py`
- `backend/app/models/chat_conversation.py`
- AI-related schemas
- AI router includes in `backend/app/main.py`
- AI-related config values if no longer used

Frontend:

- `frontend/src/components/ai/*`
- `frontend/src/stores/aiStore.ts`
- `frontend/src/api/aiService.ts`
- Any Luci assistant panel integration in layout/header/sidebar
- AI settings UI if it only configures Luci providers

Dependencies:

- Remove `langgraph`, LLM provider SDKs, and Engram-related config only after verifying no other feature uses them.

## Memory Decision

Do not migrate Luci memory or PostgreSQL chat history.

Hermes Business Agent starts with its own memory system.

Rules:

- Hermes memory is for learned preferences and business context.
- OctopusTrack remains the source of truth for products, stock, prices, clients, sales, and balances.

## Implementation Order

1. Add `HermesServiceAccount` model and Alembic migration.
2. Add `/auth/hermes/token` service-account JWT flow.
3. Add Hermes auth dependency for service tokens.
4. Add Hermes Bridge schemas and service.
5. Add read-only Bridge endpoints first: ping, products, stock, clients, suppliers, sales, dashboard.
6. Add quote parse/create endpoints.
7. Add voucher/comprobante creation endpoints with explicit safeguards.
8. Add Hermes tool module: `tools/octopus_track_tool.py`.
9. Add Hermes skill: `skills/octopus-track/SKILL.md`.
10. Configure independent Hermes Business Agent gateway/process on the VPS.
11. Run end-to-end tests from Hermes to OctopusTrack.
12. Remove Luci backend and frontend surfaces once Hermes proves stable.

## Open Questions For Later

- Exact Hermes Business Agent channel: WhatsApp, Telegram, both, or another gateway.
- Whether the Bridge should expose write operations beyond quotes/vouchers in the first test.
- Whether service-account scopes should be coarse (`read`, `write`) or fine-grained (`products:read`, `quotes:write`, etc.).
- Whether the OctopusTrack UI should show service accounts and token activity in Settings.
- Whether audit logs should record every Hermes operation as a system actor.
