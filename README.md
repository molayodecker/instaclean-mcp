# Instaclean MCP

Remote Model Context Protocol server for Instaclean. It gives AI clients such as ChatGPT, Claude, Cursor, and internal operations agents a standardized tool interface while keeping Mithril as the source of truth for authorization, pricing, booking, availability, dispatch, payments, and audit rules.

## Architecture

```text
ChatGPT / Claude / Cursor / Ops Agent
                 |
                 | MCP over HTTP
                 v
        instaclean-mcp (/mcp)
                 |
                 | authenticated HTTP/JSON
                 v
       api.tryinstaclean.com
                 |
                 v
              Mithril
```

The MCP server does not connect directly to PostgreSQL and does not duplicate Mithril business logic.

## Tools

### Read

- `search_customers` - admin customer search by name, email, or phone
- `list_dispatch_requests` - admin urgent-help/replacement queue
- `list_my_service_requests` - current customer's urgent-help/replacement requests
- `list_booking_services` - active Direct booking services
- `list_available_workers` - verified professionals eligible for a service
- `list_cleaners` - admin cleaner roster with verification/application state
- `list_cleaner_applications` - admin cleaner applications for review
- `get_booking` - current customer's booking details
- `preview_cancellation` - cancellation eligibility and policy-derived refund preview
- `diagnose_payment` - admin payment diagnostics using local attempts and Paystack verification

### Write

- `create_booking` - booking for the authenticated customer; requires `confirm: true`
- `create_admin_booking` - admin-assisted booking with explicit customer consent
- `cancel_booking` - cancel after explicit confirmation; Mithril applies cancellation policy
- `request_refund` - create an auditable refund-review request after explicit confirmation
- `reschedule_booking` - reschedule a paid one-off booking after availability revalidation
- `approve_cleaner` - admin cleaner approval after explicit confirmation
- `create_urgent_help_request` - non-medical urgent household help
- `request_replacement` - replacement request for an owned booking
- `assign_worker` - vetted worker assignment through Mithril's assignment endpoint
- `update_service_request` - triage/matching/resolve/cancel transitions

### Financial safety

The MCP server can request a refund, but it does not directly send money through Paystack. Mithril records a durable refund request with the policy-derived amount for review/processing by the canonical payment workflow.

Cancellation follows Instaclean policy in Mithril. Eligible paid cancellations queue a refund request automatically; same-day/no-refund cancellations do not create a money-moving action.

Payouts, arbitrary pricing mutation, account deletion, and direct verification-flag overrides remain outside the MCP surface. Cleaner verification changes are only available through the canonical cleaner-application approval transaction.

## Authentication

The server supports two modes.

### `passthrough` (default)

The MCP request must contain:

```http
Authorization: Bearer <mithril-access-token>
```

The token is forwarded to Mithril. Mithril validates the user and enforces customer/admin authorization. This is the preferred model for user-scoped MCP connections.

### `service`

Use this only for an internal Instaclean operations agent with a dedicated active admin account. The caller authenticates to the MCP server with `MCP_API_KEY`; the MCP server then calls Mithril using the configured Direct gateway token and actor user ID.

Required environment variables:

```text
AUTH_MODE=service
MCP_API_KEY=...
MITHRIL_DIRECT_TOKEN=...
MITHRIL_ACTOR_USER_ID=...
```

Do not use a customer account as the service actor and do not put these values in source control.

## Authorization model

Tool availability is not authorization. Mithril always rechecks the actor.

- customer booking tools require booking ownership unless the authenticated actor is an Instaclean admin
- cleaner roster, cleaner approval, customer search, dispatch administration, and payment diagnostics require admin access
- recurring booking cancellation/rescheduling is intentionally held for manual review
- cleaner approval runs the canonical database approval transaction
- booking creation/rescheduling reuses Mithril pricing, eligibility, timeslot, and availability rules

## Origin protection

MCP clients normally make server-to-server requests without an `Origin` header. If an `Origin` header is present, the server requires it to match `ALLOWED_ORIGINS`. Approved browser origins receive the required CORS headers and preflight handling.

## Development

Requires Node.js 22+.

```bash
cp .env.example .env
npm install
npm run check
npm run dev
```

The local endpoints are:

```text
GET/POST http://127.0.0.1:3000/mcp
GET      http://127.0.0.1:3000/health
```

The MCP SDK's HTTP handler retains stateless compatibility with 2025-era clients while supporting the current 2026 protocol.

## Example Cursor configuration

For service mode or development clients that support static headers:

```json
{
  "mcpServers": {
    "instaclean": {
      "type": "http",
      "url": "https://mcp.tryinstaclean.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:INSTACLEAN_MCP_TOKEN}"
      }
    }
  }
}
```

Never commit the token to a Cursor configuration checked into the repository.

## Deployment

The included Dockerfile is suitable for Fly.io or another container host. Production should expose only HTTPS externally.

For Fly.io, create the app and set secrets rather than editing `fly.toml` with credentials:

```bash
fly secrets set \
  MITHRIL_API_URL=https://api.tryinstaclean.com \
  AUTH_MODE=service \
  MCP_API_KEY=... \
  MITHRIL_DIRECT_TOKEN=... \
  MITHRIL_ACTOR_USER_ID=...
```

Then point `mcp.tryinstaclean.com` to the deployed service.

## Next security milestone: OAuth

The server deliberately supports bearer passthrough and a service-agent mode without implementing a second identity system. Before broadly connecting third-party users, add OAuth 2.1 / MCP Protected Resource Metadata so ChatGPT, Claude, and other clients can obtain scoped Mithril tokens interactively instead of receiving manually copied access tokens.

Mithril remains responsible for role checks and business invariants even after OAuth is added.
