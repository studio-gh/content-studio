# Security and client-review architecture

## Decision

Use Cloudflare Access for authenticated studio/team access and Cloudflare D1 for workspace membership, review batches, client review events, and audit history. Keep Notion as the editorial content source. A workspace owns its Notion connection and content identifiers; the application must never infer a workspace from a page ID supplied by the browser.

## Identity and authorization

- Studio/team members authenticate through Cloudflare Access.
- The Worker must validate the Access JWT signature, issuer, audience, and expiry before any private API operation. Merely checking that a JWT header exists is not authentication.
- Resolve the authenticated subject/email to an active `workspace_members` row on every protected request.
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

The migration is a schema foundation only. It has not been applied to a live database. The Worker does not yet read or write these tables.

## Required secrets and infrastructure

Before enabling private data or client review:
1. Create a D1 database and apply the migration.
2. Configure Cloudflare Access for the studio application and Worker API.
3. Configure the Access team domain and application audience in Worker environment.
4. Implement cryptographic JWT verification in the Worker, not just header presence.
5. Implement workspace resolution and role checks for every private route.
6. Implement OAuth or a secure per-workspace Notion integration. Encrypt tokens at rest using a dedicated Worker secret; never store plaintext tokens in D1.
7. Add CSRF/origin protections for cookie-authenticated writes, rate limits, audit logging, and token revocation.
8. Only then enable client review actions.

## Current safety boundary

The existing API is read-only and uses one server-side Notion token. It is not a multi-tenant service and must not be exposed with real private client data. No approval controls should be presented as functional until the D1-backed event flow and authorization checks are implemented and tested.
