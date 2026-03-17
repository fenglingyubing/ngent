# API

This document defines the current HTTP API contract.

## Common Conventions

- JSON response content type: `application/json; charset=utf-8`.
- Except `/healthz`, every `/v1/*` endpoint requires `X-Client-ID` header (non-empty).
- For every `/v1/*` request with valid `X-Client-ID`, server upserts client presence (`UpsertClient`).
- Optional auth switch:
  - if server starts with `--auth-token=<token>`, `/v1/*` also requires `Authorization: Bearer <token>`.

## Runtime Logging Conventions

- Startup prints a human-readable multi-line summary on `stderr` with `Time`, `HTTP`, `Web`, `DB`, `Agents`, and `Help`.
- Every HTTP request emits one structured completion log entry (`http.request.completed`) with:
  - `req_time` (UTC `time.DateTime`, second precision)
  - `method`
  - `path`
  - `ip`
  - `status`
  - `duration_ms`
  - `resp_bytes`
- Structured log `time` is emitted as UTC `time.DateTime` with second precision.
- Chat-asset lifecycle also emits structured stderr JSON logs:
  - `storage.upload_stored`
  - `storage.upload_rejected`
  - `storage.upload_deleted`
  - `storage.quota_deleted`
- When server starts with `--debug=true`, stderr also emits `acp.message` debug entries for ACP JSON-RPC traffic with:
  - `component`
  - `direction` (`inbound|outbound`)
  - `rpcType` (`request|response|notification`)
  - `method` when present
  - sanitized `rpc` payload with sensitive fields redacted

## Unified Error Envelope

All errors use:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "human-readable message",
    "details": {
      "field": "cwd"
    }
  }
}
```

## Implemented Endpoints

### Frontend (Web UI)

11. `GET /`
- No authentication required.
- Returns the embedded web UI (`index.html`).
- Response `200`: `text/html; charset=utf-8`.

12. `GET /assets/*`
- No authentication required.
- Returns embedded static assets (JS, CSS, fonts) produced by the frontend build.
- SPA fallback: any non-API, non-asset path also returns `index.html` so the client-side router can handle it.

### Health

1. `GET /healthz`
- Response `200`:

```json
{
  "ok": true
}
```

2. `GET /v1/agents`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- agent status contract:
  - each agent entry reports readiness as `available|unavailable`.
  - current built-in ids are `codex`, `claude`, `gemini`, `qwen`, `opencode`.
- Response `200`:

```json
{
  "agents": [
    {
      "id": "codex",
      "name": "Codex",
      "status": "available"
    },
    {
      "id": "claude",
      "name": "Claude Code",
      "status": "unavailable"
    }
  ]
}
```

2.1 `GET /v1/agents/{agentId}/models`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Behavior:
  - queries the target agent via ACP (`initialize` + `session/new`) and returns runtime-reported model options.
  - returns `503 UPSTREAM_UNAVAILABLE` when the agent runtime is unavailable or model discovery handshake fails.
- Response `200`:

```json
{
  "agentId": "codex",
  "models": [
    {"id": "gpt-5", "name": "GPT-5"},
    {"id": "gpt-5-mini", "name": "GPT-5 Mini"}
  ]
}
```

3. `POST /v1/threads`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Request:

```json
{
  "agent": "<agent-id>",
  "cwd": "/abs/path",
  "title": "optional",
  "agentOptions": {
    "mode": "safe",
    "modelId": "gpt-5"
  }
}
```

- Validation:
  - `agent` must be in allowlist (`codex|claude|gemini|qwen|opencode`).
  - `cwd` must be absolute.
  - server default policy accepts any absolute `cwd`.
  - create thread only persists row; no agent process is started.

- Response `200`:

```json
{
  "threadId": "th_..."
}
```

4. `GET /v1/threads`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Response `200`:

```json
{
  "threads": [
    {
      "threadId": "th_...",
      "agent": "<agent-id>",
      "cwd": "/abs/path",
      "title": "optional",
      "agentOptions": {},
      "summary": "",
      "createdAt": "2026-02-28T00:00:00Z",
      "updatedAt": "2026-02-28T00:00:00Z"
    }
  ]
}
```

5. `GET /v1/threads/{threadId}`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Ownership rule:
  - if thread does not exist OR does not belong to `X-Client-ID`, return `404`.
- Response `200`:

```json
{
  "thread": {
    "threadId": "th_...",
    "agent": "<agent-id>",
    "cwd": "/abs/path",
    "title": "optional",
    "agentOptions": {},
    "summary": "",
    "createdAt": "2026-02-28T00:00:00Z",
    "updatedAt": "2026-02-28T00:00:00Z"
  }
}
```

5.1 `PATCH /v1/threads/{threadId}`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Ownership rule:
  - if thread does not exist OR does not belong to `X-Client-ID`, return `404`.
- Request:

```json
{
  "title": "optional new title",
  "agentOptions": {
    "modelId": "gpt-5"
  }
}
```

- Behavior:
  - when `title` is present, trims surrounding whitespace, persists `thread.title`, and updates `updatedAt`.
  - when `agentOptions` is present, updates persisted `thread.agentOptions` and `updatedAt`.
  - if the update changes shared thread state (`title`, `modelId`, `configOverrides`, or other non-session fields) while any session on the thread is active, returns `409 CONFLICT`.
  - session-only `agentOptions.sessionId` updates are allowed while a different session on the same thread is active.
  - closes cached thread-scoped agent providers only when the update changes non-session agent options, so the next turn uses updated shared options.
- Response `200`:

```json
{
  "thread": {
    "threadId": "th_...",
    "agent": "<agent-id>",
    "cwd": "/abs/path",
    "title": "optional",
    "agentOptions": {
      "modelId": "gpt-5"
    },
    "summary": "",
    "createdAt": "2026-02-28T00:00:00Z",
    "updatedAt": "2026-02-28T00:05:00Z"
  }
}
```

5.2 `DELETE /v1/threads/{threadId}`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Ownership rule:
  - if thread does not exist OR does not belong to `X-Client-ID`, return `404`.
- Behavior:
  - hard-deletes thread history (thread row + turns + events).
  - if any session on the thread has an active turn, returns `409 CONFLICT`.
- Response `200`:

```json
{
  "threadId": "th_...",
  "status": "deleted"
}
```

6. `POST /v1/threads/{threadId}/turns`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Request:

```json
{
  "input": "hello",
  "stream": true,
  "attachments": ["up_123", "up_456"]
}
```

- Behavior:
  - response is SSE (`text/event-stream`).
  - `input` may be empty only when `attachments` contains at least one upload id.
  - `attachments` are deduplicated, must belong to the same `X-Client-ID`, must still be in `uploaded` state, and can be bound only once.
  - same `(thread, sessionId)` scope allows only one active turn at a time.
  - if another turn is active on that same scope, return `409 CONFLICT`.
  - different sessions on the same thread may run concurrently after switching `agentOptions.sessionId`.
  - if provider requests runtime permission, server emits `permission_required` and pauses turn until decision/timeout.

- SSE event types:
  - `turn_started`: `{"turnId":"..."}`
  - `message_delta`: `{"turnId":"...","delta":"..."}`
  - `plan_update`: `{"turnId":"...","entries":[{"content":"...","status":"pending|in_progress|completed","priority":"low|medium|high"}]}`
  - `permission_required`: `{"turnId":"...","permissionId":"...","approval":"command|file|network|mcp","command":"...","requestId":"..."}`
  - `turn_completed`: `{"turnId":"...","stopReason":"end_turn|cancelled|error"}`
  - `error`: `{"turnId":"...","code":"...","message":"..."}`
  - for ACP `sessionUpdate == "plan"`, the server emits `plan_update` and treats each payload as a full replacement of the current plan list.

- Permission fail-closed contract:
  - permission request timeout or disconnected stream defaults to `declined`.
  - fake ACP flow uses terminal `stopReason="cancelled"` for `declined`/`cancelled`.

7. `POST /v1/turns/{turnId}/cancel`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Behavior:
  - requests cancellation for active turn.
  - terminal stream event should end with `stopReason=cancelled` if cancellation wins race.
- Response `200`:

```json
{
  "turnId": "tu_...",
  "threadId": "th_...",
  "status": "cancelling"
}
```

8. `GET /v1/threads/{threadId}/history`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Query:
  - `includeEvents=true|1` (optional, default false)
  - `includeInternal=true|1` (optional, default false)
- Response `200`:

```json
{
  "turns": [
    {
      "turnId": "tu_...",
      "requestText": "hello",
      "responseText": "hello",
      "status": "completed",
      "stopReason": "end_turn",
      "errorMessage": "",
      "createdAt": "2026-02-28T00:00:00Z",
      "completedAt": "2026-02-28T00:00:01Z",
      "events": [
        {
          "eventId": 1,
          "seq": 1,
          "type": "turn_started",
          "data": {
            "turnId": "tu_..."
          },
          "createdAt": "2026-02-28T00:00:00Z"
        }
      ]
    }
  ]
}
```

9. `POST /v1/permissions/{permissionId}`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Request:

```json
{
  "outcome": "approved"
}
```

10. `POST /v1/threads/{threadId}/compact`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Request (optional body):

```json
{
  "maxSummaryChars": 1200
}
```

- Behavior:
  - triggers one internal summarization turn (`is_internal=1`).
  - updates `threads.summary` on success.
  - internal compact turn is hidden from default history.

- Response `200`:

```json
{
  "threadId": "th_...",
  "turnId": "tu_...",
  "status": "completed",
  "stopReason": "end_turn",
  "summary": "updated summary text",
  "summaryChars": 324
}
```

- Validation:
  - `outcome` must be one of `approved|declined|cancelled`.
  - `permissionId` must exist and belong to the same `X-Client-ID`.
  - already-resolved permission returns `409 CONFLICT`.

- Response `200`:

```json
{
  "permissionId": "perm_...",
  "status": "recorded",
  "outcome": "approved"
}
```

9.1 Attachment summaries inside history turns

- User turns may include `attachments`.
- Each summary contains:

```json
{
  "uploadId": "up_123",
  "name": "design.png",
  "kind": "image",
  "mimeType": "image/png",
  "sizeBytes": 123456,
  "deleted": false
}
```

11. `POST /v1/uploads`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Request: `multipart/form-data`
  - field `files` may contain 1..10 files.
- Behavior:
  - server MIME-sniffs each file and accepts `text/*`, `image/*`, `application/pdf`, `application/json`, and zip payloads.
  - single file limit: `50 MiB`.
  - total multipart request limit: `200 MiB`.
  - files are stored under the chat asset root using server-generated names.
  - image uploads also generate a PNG thumbnail.
  - when the server has local `tesseract` available, image attachments may also contribute OCR text to the later model turn prompt.
  - upload path performs quota cleanup before and after writing; if space still cannot be freed, returns `409 QUOTA_EXCEEDED`.
- Response `200`:

```json
{
  "uploads": [
    {
      "uploadId": "up_123",
      "name": "design.png",
      "kind": "image",
      "mimeType": "image/png",
      "sizeBytes": 123456
    }
  ]
}
```

12. `DELETE /v1/uploads/{uploadId}`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Ownership rule:
  - if upload does not exist, is already deleted, or belongs to another client, return `404`.
- Behavior:
  - soft-deletes the upload row.
  - removes original file and thumbnail from disk when present.
  - immediately decrements `storage_usage.used_bytes`.
- Response `200`:

```json
{
  "uploadId": "up_123",
  "status": "deleted",
  "removedBytes": 123999,
  "originalFound": true,
  "thumbnailFound": true
}
```

13. `GET /v1/attachments/{uploadId}`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Ownership rule:
  - if upload does not exist, is deleted, or belongs to another client, return `404`.
- Behavior:
  - serves the original file with a safe `Content-Disposition`.
  - image uploads use `inline`; non-image uploads use `attachment`.

14. `GET /v1/attachments/{uploadId}/thumbnail`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Ownership rule:
  - if upload does not exist, is deleted, belongs to another client, or has no thumbnail, return `404`.
- Behavior:
  - serves the generated PNG thumbnail with `inline` disposition.

15. `GET /v1/storage`
- Headers: `X-Client-ID` (required), optional bearer auth if enabled.
- Response `200`:

```json
{
  "scope": "global",
  "maxBytes": 5368709120,
  "usedBytes": 123456,
  "usagePercent": 2,
  "policy": "delete_oldest_chat_assets_first"
}
```

- Behavior:
  - `usedBytes` is the reconciled on-disk sum of non-deleted upload originals plus thumbnails.
  - startup and background cleanup may automatically reduce `usedBytes` by deleting the oldest chat assets first.

## Baseline Error Codes

- `INVALID_ARGUMENT`: validation failed.
- `UNAUTHORIZED`: bearer token missing or invalid.
- `FORBIDDEN`: path/policy denied.
- `NOT_FOUND`: endpoint/resource missing, including cross-client thread/turn access.
- `CONFLICT`: active-turn conflict or invalid cancel state.
- `QUOTA_EXCEEDED`: chat-asset quota could not be reduced enough for a new upload.
- `TIMEOUT`: upstream/model operation exceeded allowed time budget.
- `UPSTREAM_UNAVAILABLE`: configured agent/provider is unavailable or failed to start/respond.
- `INTERNAL`: unexpected server/storage failure.
