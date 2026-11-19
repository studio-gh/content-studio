# Security and client-review architecture

## Decision

Use Cloudflare Access for authenticated studio/team access and Cloudflare D1 for workspace membership, review batches, client review events, and audit history. Keep Notion as the editorial content source. A workspace owns its Notion connection and content identifiers; the application must never infer a workspace from a page ID supplied by the browser.

## Identity and authorization

- Studio/team members authenticate through Cloudflare Access.
- Cloudflare Access authenticates the request before it reaches the Worker. The Worker reads the validated identity through `ctx.access.getIdentity()`; no manual JWT parsing or separate Access secrets are required.
- For the current single-owner version, the Worker treats the Cloudflare Access policy as the authorization boundary. Workspace membership lookup and role enforcement are future work for the multi-workspace version.
- Enforce role permissions server-side: owner/admin manage workspace and invitations; editor manages content workflow; reviewer can read assigned review batches and submit review events only.
- A reviewer link is a separate, expiring, revocable capability scoped to one review batch. Store only a SHA-256 hash of its random token in D1. Never expose a workspace-wide API key.
- All Notion reads must use the Notion connection belonging to the resolved workspace. Never accept a Notion database ID or token directly from the browser.

## Review model

- A review batch contains one or more Notion page IDs in a stable order.
- Client actions append immutable `review_events`: `approved`, `changes_requested`, or `commented`.
- Do not overwrite or delete past review events. Current item state is derived from the latest relevant event; the audit timeline remains intact.
- A batch can be draft, sent, in review, completed, expired, or revoked.
- Review links are batch-scoped, expire, and can be revoked. They do not grant access to the workspace planner or other clients.
- Notion remains the source of truth for editorial copy and assets. D1 is the source of truth for identities, permissions, invitations, review decisions, comments, and audit events.

## D1 schema

Migration `migrations/0001_workspace_review_foundation.sql` defines:
- `workspaces` and `workspace_members`
- `notion_connections` (encrypted token fields only)
- `review_batches` and `review_items`
- append-only `review_events`
- hashed, expiring `review_link_tokens`

The migration is a schema foundation only. It has not been applied to a live database. The Worker does not yet read or write these tables. The current API uses one server-side Notion token and fixed data-source IDs.

## Required secrets and infrastructure

Before enabling private data or client review:
1. Create a D1 database and apply the migration.
2. Configure Cloudflare Access for the studio application and Worker API.
3. Bind D1 as `DB` and implement workspace membership and role checks before enabling multiple workspaces.
4. The current Worker reads the authenticated identity from `ctx.access`, while Notion reads still use one global `NOTION_TOKEN` and fixed data-source IDs. This is a single-owner gate, not complete multi-tenant isolation.
6. Implement OAuth or a secure per-workspace Notion integration. Encrypt tokens at rest using a dedicated Worker secret; never store plaintext tokens in D1.
7. Add rate limits, audit logging, and token revocation.
8. Only then enable client review actions.

## Current safety boundary

The existing API is read-only and uses one server-side Notion token. It is not a multi-tenant service and must not be exposed with real private client data. No approval controls should be presented as functional until the D1-backed event flow and authorization checks are implemented and tested.
