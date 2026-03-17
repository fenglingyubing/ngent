# DB

## Storage Choice

- Engine: SQLite.
- Access layer: `database/sql` + `modernc.org/sqlite` (pure Go driver).
- Runtime pragmas at open:
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA busy_timeout = 5000`
  - `PRAGMA journal_mode = WAL`

## Migration Strategy

- Migrations are versioned and applied in order.
- Applied versions are recorded in `schema_migrations`.
- Repeat startup is idempotent: already applied versions are skipped.
- DDL uses `IF NOT EXISTS` to keep reruns safe.

### `schema_migrations`

- `version INTEGER PRIMARY KEY`
- `name TEXT NOT NULL`
- `applied_at TEXT NOT NULL`

## Implemented Tables

### `clients`

- `client_id TEXT PRIMARY KEY`
- `created_at TEXT NOT NULL`
- `last_seen_at TEXT NOT NULL`

### `threads`

- `thread_id TEXT PRIMARY KEY`
- `client_id TEXT NOT NULL REFERENCES clients(client_id)`
- `agent_id TEXT NOT NULL`
- `cwd TEXT NOT NULL`
- `title TEXT NOT NULL`
- `agent_options_json TEXT NOT NULL`
- `summary TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### `turns`

- `turn_id TEXT PRIMARY KEY`
- `thread_id TEXT NOT NULL REFERENCES threads(thread_id)`
- `request_text TEXT NOT NULL`
- `response_text TEXT NOT NULL`
- `is_internal INTEGER NOT NULL DEFAULT 0`
- `status TEXT NOT NULL`
- `stop_reason TEXT NOT NULL`
- `error_message TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `completed_at TEXT`

### `events`

- `event_id INTEGER PRIMARY KEY AUTOINCREMENT`
- `turn_id TEXT NOT NULL REFERENCES turns(turn_id)`
- `seq INTEGER NOT NULL`
- `type TEXT NOT NULL`
- `data_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`

### `uploads`

- `upload_id TEXT PRIMARY KEY`
- `client_id TEXT NOT NULL REFERENCES clients(client_id)`
- `thread_id TEXT NOT NULL DEFAULT ''`
- `turn_id TEXT NOT NULL DEFAULT ''`
- `role TEXT NOT NULL`
- `kind TEXT NOT NULL`
- `status TEXT NOT NULL`
- `origin_name TEXT NOT NULL`
- `stored_name TEXT NOT NULL`
- `mime_type TEXT NOT NULL`
- `size_bytes INTEGER NOT NULL`
- `storage_path TEXT NOT NULL`
- `thumbnail_path TEXT NOT NULL DEFAULT ''`
- `sha256 TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL`
- `last_accessed_at TEXT NOT NULL`
- `deleted_at TEXT NOT NULL DEFAULT ''`

### `storage_usage`

- `scope TEXT PRIMARY KEY`
- `used_bytes INTEGER NOT NULL`
- `max_bytes INTEGER NOT NULL`
- `updated_at TEXT NOT NULL`

- default row:
  - `scope='global'`
  - `max_bytes=5368709120`

### `session_transcript_cache`

- `agent_id TEXT NOT NULL`
- `cwd TEXT NOT NULL`
- `session_id TEXT NOT NULL`
- `messages_json TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `PRIMARY KEY (agent_id, cwd, session_id)`

### `agent_slash_commands`

- `agent_id TEXT PRIMARY KEY`
- `commands_json TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

## Indexes (M2)

- `idx_threads_client_id` on `threads(client_id)`
- `idx_turns_thread_id_created_at` on `turns(thread_id, created_at)`
- `idx_events_turn_id_seq` unique index on `events(turn_id, seq)`
- `idx_uploads_client_status_created_at` on `uploads(client_id, status, created_at)`
- `idx_uploads_thread_created_at` on `uploads(thread_id, created_at)`
- `idx_uploads_turn_id` on `uploads(turn_id)`
- `session_transcript_cache` primary key on `(agent_id, cwd, session_id)`

## Storage API (M2)

- `UpsertClient(clientID)`
- `CreateThread(...)`
- `GetThread(threadID)`
- `UpdateThreadSummary(threadID, summary)`
- `ListThreadsByClient(clientID)`
- `GetSessionTranscriptCache(agentID, cwd, sessionID)`
- `UpsertSessionTranscriptCache(...)`
- `GetAgentSlashCommands(agentID)`
- `UpsertAgentSlashCommands(...)`
- `CreateTurn(...)`
- `GetTurn(turnID)`
- `ListTurnsByThread(threadID)`
- `AppendEvent(turnID, type, dataJSON)`
- `ListEventsByTurn(turnID)`
- `FinalizeTurn(...)`
- `CreateUpload(...)`
- `GetUpload(uploadID)`
- `ListUploadsByClient(clientID)`
- `BindUploadsToTurn(...)`
- `ListUploadsByTurn(turnID)`
- `DeleteUpload(clientID, uploadID)`
- `GetStorageUsage(scope)`
- `AddStorageUsageBytes(scope, delta)`
- `UpdateStorageUsageLimit(scope, maxBytes)`
- `RecalculateStorageUsage(scope)`
- `CleanupStorageUsageToLimit(scope, targetBytes)`

## Event Sequence Rule

- `AppendEvent` computes `seq` as `max(seq)+1` per `turn_id` in a transaction.
- Unique index on `(turn_id, seq)` enforces sequence uniqueness.

## Chat Asset State Rules

- `uploads.status` transitions:
  - `uploaded` -> file exists on disk and is not yet bound to a turn.
  - `attached` -> file is bound to one turn and may appear in history.
  - `deleted` -> original file and thumbnail have been removed or are no longer addressable through the API.
- `storage_usage.used_bytes` tracks the reconciled on-disk bytes of non-deleted upload originals plus thumbnails only.
- automatic quota cleanup deletes uploads in `created_at ASC` order and then rewrites `used_bytes` through the same storage API used by manual deletion.
