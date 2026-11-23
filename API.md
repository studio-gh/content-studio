# Content Studio API

Internal API contract for the Studio GH / Glermenrik workspace.

Base URL (current production Worker):
`https://content-studio-api.studio-gh.workers.dev`

> The endpoints added in the `feature/internal-use-api` branch are not live until the Worker is deployed.

## Read endpoints

### `GET /api/health`
Returns service status and whether the Notion token is configured.

### `GET /api/profile`
Returns the current brand profile from Notion.

Response:
```json
{ "ok": true, "profile": { "id": "...", "name": "...", "username": "..." } }
```

### `GET /api/feed?limit=50`
Returns scheduled content items. The limit is capped at 50.

Response:
```json
{ "ok": true, "total": 1, "hasMore": false, "nextCursor": null, "posts": [] }
```

### `GET /api/ideas`
Returns the newest records from Canto das Ideias (up to 50 per request).

Idea fields: `id`, `title`, `note`, `status`, `topic`, `source`, `createdAt`, `notionUrl`, `updatedAt`.

### `GET /api/assets`
Returns the newest records from Acervo (up to 50 per request).

Asset fields: `id`, `name`, `type`, `category`, `tags`, `brand`, `description`, `driveUrl`, `files`, `notionUrl`, `updatedAt`.

## Write endpoints

### `POST /api/ideas`
Creates a new idea in Canto das Ideias with status `Nova`.

Request body:
```json
{
  "key": "CONTENT_STUDIO_WRITE_KEY",
  "title": "Required, max 180 characters",
  "note": "Optional, max 2000 characters",
  "topic": "Design",
  "source": "https://example.com"
}
```

Allowed topics: `Design`, `Tecnologia`, `Arte`, `Cultura`, `Negócios`, `Pessoal`.

- `title` is required.
- `note`, `topic`, and `source` are optional.
- `source`, when supplied, must use `http://` or `https://`.
- Success returns HTTP 201 and the created `idea`.
- Invalid input returns HTTP 400; missing server key returns HTTP 503; an incorrect key returns HTTP 401.

**Security:** `NOTION_TOKEN` and `CONTENT_STUDIO_WRITE_KEY` are Worker secrets. Never commit either value or hardcode the write key in public browser JavaScript/HTML. The frontend write flow still needs a safe access pattern before it is enabled for everyday use.

### `POST /api/reorder`
Existing protected endpoint for saving feed order. Requires `CONTENT_STUDIO_WRITE_KEY` and an `orderedIds` array.

## Current limitations

- Ideas and assets endpoints currently return one page of up to 50 records. Cursor pagination is not implemented for these two collections yet.
- Live validation against the deployed Worker and Notion is still required after deployment.
- The Instagram preview HTML is intentionally frozen and is not part of this API change.
