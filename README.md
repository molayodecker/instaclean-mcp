# Instaclean MCP

Remote Model Context Protocol server for Instaclean. It gives AI clients such as ChatGPT, Claude, Cursor, and internal operations agents a standardized tool interface while keeping Mithril as the source of truth for authorization, pricing, booking, availability, dispatch, and audit rules.

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
- `get_booking` - current customer's booking details

### Write

- `create_admin_booking` - admin-assisted booking with explicit customer consent
- `create_urgent_help_request` - non-medical urgent household help
- `request_replacement` - replacement request for an owned booking
- `assign_worker` - vetted worker assignment through Mithril's assignment endpoint
- `update_service_request` - triage/matching/resolve/cancel transitions

Payments, refunds, payouts, pricing mutation, account deletion, and verification mutation are intentionally not exposed in the initial MCP surface.

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

## Origin protection

MCP clients normally make server-to-server requests without an `Origin` header. If an `Origin` header is present, the server requires it to match `ALLOWED_ORIGINS`. This protects the HTTP MCP endpoint against browser-based DNS-rebinding attacks.

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

The MCP SDK's HTTP handler also retains stateless compatibility with 2025-era clients while supporting the current 2026 protocol.

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

The initial server deliberately supports bearer passthrough and a service-agent mode without implementing a second identity system. Before broadly connecting third-party users, add OAuth 2.1 / MCP Protected Resource Metadata so ChatGPT, Claude, and other clients can obtain scoped Mithril tokens interactively instead of receiving manually copied access tokens.

Mithril remains responsible for role checks and business invariants even after OAuth is added.
