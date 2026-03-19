# ACCEPTANCE

This checklist defines executable acceptance checks for requirements 1-16.

## Requirement 1: HTTP/JSON plus SSE

- Operation: call JSON endpoint and one SSE turn endpoint.
- Expected: JSON response is `application/json`; turn endpoint is `text/event-stream`; turn streams can persist auxiliary event types such as `reasoning_delta` and `plan_update` alongside `message_delta`.
- Verification command:
  - `curl -sS -i http://127.0.0.1:8686/healthz`
  - `curl -sS -N -H 'X-Client-ID: demo' -H 'Content-Type: application/json' -d '{"input":"hello","stream":true}' http://127.0.0.1:8686/v1/threads/<threadId>/turns`
  - `go test ./internal/httpapi -run TestTurnsSSEAndHistory -count=1`
  - `go test ./internal/httpapi -run TestTurnsSSEIncludesReasoningAndPersistsHistory -count=1`

## Requirement 2: Multi-client and multi-thread support

- Operation: create threads under different `X-Client-ID` headers and verify isolation.
- Expected: no cross-client leakage.
- Verification command:
  - `go test ./internal/httpapi -run TestThreadAccessAcrossClientsReturnsNotFound -count=1`

## Requirement 3: Per-thread independent agent instance

- Operation: run turns on multiple threads concurrently.
- Expected: each thread resolves/uses its own thread-level agent path.
- Verification command:
  - `go test ./internal/httpapi -run TestMultiThreadParallelTurns -count=1`

## Requirement 4: One active turn per thread/session scope plus cancel

- Operation: start first turn, submit second turn on same session, verify conflict; then switch to another session on the same thread and verify that second session can run concurrently; finally cancel.
- Expected: same-session second turn gets `409 CONFLICT`; different session on the same thread is allowed; cancel converges quickly.
- Verification command:
  - `go test ./internal/httpapi -run 'TestTurnConflictSingleActiveTurnPerSession|TestTurnAllowsConcurrentSessionsOnSameThread|TestUpdateThreadClearingSessionDropsStaleUnboundProvider' -count=1`
  - `go test ./internal/httpapi -run TestTurnCancel -count=1`

## Requirement 5: Lazy startup

- Operation: create thread first, then start first turn.
- Expected: provider factory is not called at thread creation; called at first turn only.
- Verification command:
  - `go test ./internal/httpapi -run TestTurnAgentFactoryIsLazy -count=1`

## Requirement 6: Durable SQLite history and restart continuity

- Operation: run turn, recreate server instance with same DB, run next turn.
- Expected: next turn still injects prior history/summary and continues.
- Verification command:
  - `go test ./internal/httpapi -run TestRestartRecoveryWithInjectedContext -count=1`

## Requirement 7: Permission forwarding and fail-closed

- Operation: trigger permission-required flow; test approved, timeout, and disconnect cases.
- Expected: `permission_required` emitted; timeout/disconnect fails closed.
  - embedded codex command-approval flow should not fail with adapter-side `-32601 method not found` when using updated app-server request methods.
- Verification command:
  - `go test ./internal/httpapi -run TestTurnPermissionRequiredSSEEvent -count=1`
  - `go test ./internal/httpapi -run TestTurnPermissionApprovedContinuesAndCompletes -count=1`
  - `go test ./internal/httpapi -run TestTurnPermissionTimeoutFailClosed -count=1`
  - `go test ./internal/httpapi -run TestTurnPermissionSSEDisconnectFailClosed -count=1`

## Requirement 8: Localhost-by-default bind with public opt-in

- Operation: validate listen address policy with/without allow-public.
- Expected: only loopback bind is allowed by default; `--allow-public=true` allows non-loopback binds.
- Verification command:
  - `go test ./cmd/ngent -run TestResolveListenAddr -count=1`

## Requirement 9: Startup logging contract

- Operation: start server and inspect startup output on stderr.
- Expected: startup output is multi-line, human-readable, includes a QR code (when public bind is enabled), and prints the service port + a concrete URL under the QR code.
- Verification command:
  - `go test ./cmd/ngent -count=1`
  - manual run: `go run ./cmd/ngent`

## Requirement 10: Unified errors and structured logs

- Operation: trigger auth failure/path policy failure and inspect request completion logs.
- Expected: `UNAUTHORIZED` and `FORBIDDEN` error envelopes are stable; request logs include `req_time`, `path`, `ip`, and `status`.
- Verification command:
  - `go test ./internal/httpapi -run TestV1AuthToggle -count=1`
  - `go test ./internal/httpapi -run TestCreateThreadValidationCWDAllowedRoots -count=1`
  - `go test ./internal/httpapi -run TestRequestCompletionLogIncludesPathIPAndStatus -count=1`

## Requirement 11: Context window and compact

- Operation: run multiple turns, compact once, verify summary update and injection impact.
- Expected: summary/recent/current-input injection works; compact updates `threads.summary`; internal turns hidden by default.
- Verification command:
  - `go test ./internal/httpapi -run TestInjectedPromptIncludesSummaryAndRecent -count=1`
  - `go test ./internal/httpapi -run TestCompactUpdatesSummaryAndAffectsNextTurn -count=1`

## Requirement 12: Idle TTL reclaim and graceful shutdown

- Operation: configure short idle TTL; verify reclaim; simulate shutdown with active turn.
- Expected: idle thread agent is reclaimed and closed; shutdown force-cancels active turns on timeout.
- Verification command:
  - `go test ./internal/httpapi -run TestAgentIdleTTLReclaimsThreadAgent -count=1`
  - `go test ./cmd/ngent -run TestGracefulShutdownForceCancelsTurns -count=1`

## Requirement 13: Embedded Web UI

- Operation: start server; open browser at `http://127.0.0.1:8686/`.
- Expected: UI loads, threads can be created, turns stream in real time, ACP plan/reasoning updates render as live agent-side sections, live reasoning shows `思考中`, finalized reasoning shows `思考过程`, finalized reasoning uses a lightweight inline toggle, renders markdown, and collapses by default, permissions can be resolved, and history is browsable.
- Additional UI shell expectations:
  - desktop defaults to a prototype-aligned shell with a dark left conversation rail, centered white chat canvas, plain-text assistant response layout, and a floating rounded composer.
  - session browsing remains available through the overlay sheet instead of a permanently visible desktop right rail.
  - composer footer controls must not overlap textarea content on desktop or mobile-width layouts.
  - desktop header exposes visible `查看会话` and `新建会话` shortcuts, and primary reading surfaces stay near an `18px` baseline.
  - user message bubbles remain visibly right-aligned inside the chat column.
- Verification command:
  - `go test ./internal/webui -count=1` (checks `GET /` returns 200 with `text/html` content-type and SPA fallback)
  - `go test ./internal/httpapi -run TestTurnsSSEIncludesReasoningAndPersistsHistory -count=1`
  - `cd internal/webui/web && npm run build`
  - Playwright smoke: run a production-preview fixture and assert `.thread-config-switches` does not intersect `#message-input`
  - Playwright smoke: run a production-preview fixture and assert `#mobile-session-list-btn` / `#mobile-new-session-btn` are visible plus `.message-bubble`, `#message-input`, and `.thread-item-title` resolve to at least `18px`
  - Playwright smoke: run a production-preview fixture and assert `.message--user .message-group` right edge is effectively flush with the user message row
  - manual: `make run` → open `http://127.0.0.1:8686/` or scan the startup QR code from another device, confirm live `思考中` stays expanded while streaming, finalized reasoning label changes to `思考过程`, markdown inside expanded `思考过程` renders correctly, and the section collapses after the turn completes

## Requirement 13A: Web Chat Turn Attachments

- Operation: upload one image and one regular file, send them with and without text, then reload history.
- Expected:
  - `POST /v1/threads/{threadId}/turns` accepts `attachments` and allows attachment-only turns.
  - `GET /v1/threads/{threadId}/history` returns attachment summaries on the bound turn.
  - the Web UI renders persisted user attachment cards and differentiates image vs file styling.
  - reusing an already attached upload on another thread returns `409 CONFLICT`.
- Verification command:
  - `go test ./internal/httpapi -run 'TestTurnsBindAttachmentsAndHistoryIncludesSummaries|TestTurnsRejectReusedAttachmentAcrossThreads' -count=1`
  - `go test ./internal/storage -run 'TestBindUploadsToTurnAndListByTurn|TestBindUploadsToTurnRejectsReuse' -count=1`
  - `cd internal/webui/web && npm run build`

## Requirement 13B: Web Chat Attachment Download And Preview

- Operation: upload one image and one regular file, fetch the thumbnail and original attachment endpoints, then verify the Web UI build still succeeds with preview/download controls.
- Expected:
  - `GET /v1/attachments/{uploadId}/thumbnail` returns an image thumbnail for uploaded images.
  - `GET /v1/attachments/{uploadId}` returns the original file with a safe `Content-Disposition`.
  - deleted attachments return `404 NOT_FOUND`.
  - the Web UI can render thumbnail-backed image cards, open a full-size preview, and download regular files through authenticated blob fetches.
- Verification command:
  - `go test ./internal/httpapi -run 'TestAttachmentDownloadAndThumbnailEndpoints|TestAttachmentDeletedReturnsNotFound' -count=1`
  - `cd internal/webui/web && npm run build`

## Requirement 13C: Web Chat Storage Usage Visibility

- Operation: read the storage endpoint, upload a file, delete it again, then confirm startup/disk reconciliation and the Web UI storage badge build path.
- Expected:
  - `GET /v1/storage` returns `scope`, `usedBytes`, `maxBytes`, `usagePercent`, and `policy`.
  - upload increases `usedBytes`, and deleting the same upload reduces `usedBytes`.
  - startup/disk reconciliation rewrites usage to match real upload + thumbnail files on disk.
  - the Web UI can render a storage usage badge with warning thresholds above `80%` and `95%`.
- Verification command:
  - `go test ./internal/httpapi -run TestStorageUsageReflectsUploadAndDelete -count=1`
  - `go test ./internal/storage -run 'TestRecalculateStorageUsageMatchesDisk|TestDeleteUploadRemovesFilesAndUsage' -count=1`
  - `cd internal/webui/web && npm run build`

## Requirement 13D: Web Chat Automatic Quota Cleanup

- Operation: force storage usage above the configured limit, upload another file, and verify startup/runtime cleanup removes the oldest chat assets first.
- Expected:
  - uploads attempt pre-write cleanup and post-write cleanup before returning `QUOTA_EXCEEDED`.
  - startup reconciliation also trims oldest assets when the reconciled usage already exceeds `maxBytes`.
  - auto-cleaned attachments are soft-deleted in `uploads`, removed from disk, and no longer downloadable.
  - when no deletable assets remain, upload returns `409 QUOTA_EXCEEDED`.
- Verification command:
  - `go test ./internal/storage -run 'TestCleanupStorageUsageToLimitDeletesOldestUploads|TestCleanupStorageUsageToLimitReturnsQuotaExceededWhenNothingToDelete' -count=1`
  - `go test ./internal/httpapi -run 'TestV1UploadsAutoCleanupOldestAssetsBeforeWrite|TestV1UploadsReturnQuotaExceededWhenCleanupCannotFreeEnough' -count=1`
  - `go test ./cmd/ngent -count=1`
  - `cd internal/webui/web && npm run build`

## Global Gate

- Operation: run repository checks.
- Expected: formatting and tests are green.
- Verification command:
  - `gofmt -w $(find . -name '*.go' -type f)`
  - `cd internal/webui/web && npm run build`
  - `go test ./...`

## Requirement 14: OpenCode Agent

- Operation: verify opencode provider is listed and can complete a turn.
- Expected: `GET /v1/agents` includes `{"id":"opencode","name":"OpenCode","status":"available"}` when `opencode` is in PATH; a full turn over SSE returns `message_delta` events.
- Verification commands:
  - `go test ./internal/agents/opencode -run TestStreamWithFakeProcess -count=1`
  - `E2E_OPENCODE=1 go test ./internal/agents/opencode -run TestOpenCodeE2ESmoke -v -timeout 60s`
- Latest observed validation (2026-03-13):
  - unit/fake-process path: pass
  - real host smoke: fail with `opencode: session/new: context deadline exceeded`; tracked as `KI-028`

## Requirement 15: Gemini CLI Agent

- Operation: verify Gemini CLI provider is listed and can complete a turn.
- Expected: `GET /v1/agents` includes `{"id":"gemini","name":"Gemini CLI","status":"available"}` when `gemini` is in PATH and `GEMINI_API_KEY` is set; a full turn over SSE returns `message_delta` events.
- Verification commands:
  - `go test ./internal/agents/gemini -run TestStreamWithFakeProcess -count=1`
  - `E2E_GEMINI=1 go test ./internal/agents/gemini -run TestGeminiE2ESmoke -v -timeout 60s`

## Requirement 16: Qwen Code Agent

- Operation: verify qwen provider is listed and can complete a turn over ACP.
- Expected:
  - `GET /v1/agents` includes `{"id":"qwen","name":"Qwen Code","status":"available"}` when `qwen` is in PATH.
  - thread creation accepts `agent=qwen`.
  - turn streaming emits `message_delta` and finishes with `turn_completed` (or explicit upstream error envelope).
  - permission flow remains fail-closed.
- Verification commands (executed 2026-03-03):
  - `qwen --version` (pass, `0.11.0`)
  - `go test ./internal/agents/qwen -count=1` (pass)
  - `E2E_QWEN=1 go test ./internal/agents/qwen -run TestQwenE2ESmoke -v -timeout 120s` (pass, real prompt returns `PONG`)
  - `go test ./cmd/ngent ./internal/httpapi -count=1` (pass)
- Additional validation (executed 2026-03-13):
  - `E2E_QWEN=1 go test ./internal/agents/qwen -run TestQwenE2ESmoke -count=1 -v -timeout 180s` (pass)
  - `E2E_QWEN=1 go test ./internal/agents/qwen -run TestQwenE2ESessionTranscriptReplay -count=1 -v -timeout 240s` (pass)

## Requirement 16A: Kimi CLI Agent

- Operation: verify kimi provider is listed and can complete a turn over ACP.
- Expected:
  - `GET /v1/agents` includes `{"id":"kimi","name":"Kimi CLI","status":"available"}` when `kimi` is in PATH.
  - thread creation accepts `agent=kimi`.
  - turn streaming emits `message_delta` and finishes with `turn_completed` (or explicit upstream error envelope).
  - provider tolerates current upstream ACP startup variants `kimi acp` and `kimi --acp`.
  - thread config/model discovery avoids creating extra empty Kimi sessions when local Kimi config is available.
- Verification commands:
  - `go test ./internal/agents/kimi -count=1`
  - `E2E_KIMI=1 go test ./internal/agents/kimi -run TestKimiConfigOptionsE2EDoesNotCreateSession -v -timeout 120s`
  - `E2E_KIMI=1 go test ./internal/agents/kimi -run TestKimiE2ESmoke -v -timeout 120s`
  - `go test ./cmd/ngent ./internal/httpapi -count=1`
- Additional validation (executed 2026-03-13):
  - `E2E_KIMI=1 go test ./internal/agents/kimi -run TestKimiConfigOptionsE2EDoesNotCreateSession -count=1 -v -timeout 240s` (pass)
  - `E2E_KIMI=1 go test ./internal/agents/kimi -run TestKimiE2ESmoke -count=1 -v -timeout 180s` (pass)

## Requirement 17: Thread Delete Lifecycle

- Operation: delete an existing thread from API/UI, verify ownership behavior, conflict behavior, and provider cleanup.
- Expected:
  - `DELETE /v1/threads/{threadId}` returns `200` with `status=deleted` for same-client thread.
  - deleting a thread with an active turn returns `409 CONFLICT`.
  - deleted thread is no longer visible in list/get/history endpoints.
  - cached thread agent provider is closed when the thread is deleted.
- Verification commands (executed 2026-03-03):
  - `go test ./internal/storage -run TestDeleteThread -count=1`
  - `go test ./internal/httpapi -run TestDeleteThread -count=1`
  - `cd internal/webui/web && npm run build`

## Requirement 18: Thread Model Selection and Switching

- Operation:
  - query agent model catalog via `GET /v1/agents/{agentId}/models`.
  - create thread with `agentOptions.modelId`.
  - update existing thread model via `PATCH /v1/threads/{threadId}`.
  - verify active-turn conflict and provider cache refresh behavior.
- Expected:
  - model catalog endpoint returns ACP-reported provider model options for each built-in agent.
  - thread create/list/get payload includes persisted `agentOptions.modelId`.
  - thread update persists model override and returns updated thread payload.
  - updating while turn is active returns `409 CONFLICT`.
  - successful update closes cached thread provider so next turn uses new model config.
- Verification commands (executed 2026-03-05):
  - `go test ./internal/httpapi -run TestV1AgentModels -count=1`
  - `go test ./internal/agents/acpmodel -count=1`
  - `go test ./internal/storage -run TestUpdateThreadAgentOptions -count=1`
  - `go test ./internal/httpapi -run TestUpdateThreadAgentOptions -count=1`
  - `go test ./internal/httpapi -run TestUpdateThreadConflictWhenActiveTurn -count=1`
  - `go test ./internal/httpapi -run TestUpdateThreadClosesCachedAgent -count=1`
  - `cd internal/webui/web && npm run build`

## Requirement 19: Thread Session Config Options (Model + Reasoning)

- Operation:
  - open/create a thread, query `GET /v1/threads/{threadId}/config-options`.
  - confirm response includes `configOptions` and model/reasoning-style options use ACP `currentValue` + `options`.
  - switch model through `POST /v1/threads/{threadId}/config-options` with `{configId:"model", value:"..."}`.
  - switch a non-model config option (for example reasoning) through the same endpoint.
  - verify persistence of `agentOptions.modelId` and `agentOptions.configOverrides` for subsequent turns/restarts.
  - verify Web UI composer footer shows both `Model` and `Reasoning`, applies on selection (no Apply button), and refreshes reasoning choices after model changes.
- Expected:
  - model selector data source is thread-level ACP `configOptions` (`category=model` / `id=model`).
  - reasoning selector data source is thread-level ACP `configOptions` (`category=reasoning`).
  - selected model/reasoning changes are persisted immediately into sqlite thread state without an extra Apply button.
  - if the cached session/provider is still using older model/reasoning selections, ngent applies the diff only on the next turn, before `session/prompt` is sent.
  - returned and persisted current values stay consistent:
    - `configOptions.model.currentValue` == thread `agentOptions.modelId`
    - non-model current values are mirrored into `thread.agentOptions.configOverrides`
  - normalized model/reasoning catalogs are persisted in sqlite and reused after service restart.
  - startup refresh of persisted catalogs happens asynchronously in the background and does not block frontend/API availability.
  - same-agent threads do not share selected current values, but can reuse the same stored catalog data for the same selected model.
  - title/model/config mutations are rejected with `409 CONFLICT` while any session on the thread is active.
  - session-only selection updates remain allowed when they switch to a different session.
  - clearing `sessionId` from the Web UI `New session` action invalidates any stale empty-session provider cache so the next turn does not fall back into an older ACP session.
  - if that clear happens after an explicit historical-session selection, the first turn of the fresh session is sent without `[Conversation Summary]` / `[Recent Turns]` injection, so the new ACP session transcript contains only the new exchange.
- Verification commands (executed 2026-03-06):
  - `go test ./internal/httpapi -run TestThreadConfigOptions -count=1`
  - `go test ./internal/httpapi -run TestThreadConfigOptionsPersistConfigOverrides -count=1`
  - `go test ./internal/httpapi -run TestV1AgentModelsUsesStoredCatalog -count=1`
  - `go test ./internal/agents/acpmodel -count=1`
  - `go test ./cmd/ngent -run TestAgentConfigCatalogRefresher -count=1`
  - `go test ./cmd/ngent -run TestExtractConfigOverrides -count=1`
  - `cd internal/webui/web && npm run build`
  - `go test ./...`

## Requirement 20: Thread Drawer Actions and Rename

- Operation:
  - open sidebar thread actions from a thread-row drawer trigger.
  - rename a thread inline from the drawer.
  - delete a thread from the same drawer.
- Expected:
  - thread row exposes a drawer trigger instead of a direct delete icon button.
  - drawer lists `Rename` before `Delete`.
  - delete is text-only and styled as the dangerous action.
  - rename persists `thread.title` through `PATCH /v1/threads/{threadId}` and returns the updated thread payload.
  - rename/delete continue to respect active-turn safety (`409 CONFLICT` while the thread is running).
- Verification commands (executed 2026-03-06):
  - `go test ./internal/storage -run TestUpdateThreadTitle -count=1`
  - `go test ./internal/httpapi -run TestUpdateThreadTitle -count=1`
  - `cd internal/webui/web && npm run build`

## Current Acceptance Result (Integration Update, 2026-03-03)

- Scope: qwen provider implementation + server wiring + test coverage.
- Result:
  - implementation verification passed:
    - qwen provider unit/fake-process tests passed.
    - server/httpapi wiring tests passed (includes qwen allowlist coverage).
  - real qwen smoke in host environment: `Passed`.
  - Requirement 16 status: `Accepted`.

## Requirement 21: Embedded Codex Tool User-Input Request Compatibility

- Operation:
  - trigger codex app-server request path that emits `item/tool/requestUserInput` (for example MCP tool interaction requiring follow-up selection).
  - observe adapter response and downstream behavior.
- Expected:
  - adapter no longer returns JSON-RPC hard error `-32000 ... requestUserInput is not supported`.
  - request receives schema-compatible `answers` payload.
  - `item/tool/call` fallback returns structured response (`success=false`) instead of hard method error.
- Verification commands (executed 2026-03-06):
  - `go test ./...`
  - `cd internal/webui/web && npm run build`

## Requirement 22: ACP Debug Trace Logging

- Operation:
  - start server with `--debug=true`.
  - execute an ACP-backed request path.
  - inspect stderr logs.
- Expected:
  - logger runs at debug level.
  - stderr includes `acp.message` entries for outbound and inbound ACP JSON-RPC traffic.
  - entries include `component`, `direction`, `rpcType`, `method` when present, and sanitized `rpc` payload.
  - sensitive fields/tokens are redacted before logging.
- Verification commands (executed 2026-03-11):
  - `go test ./internal/observability ./internal/agents/acpstdio -count=1`
  - `go test ./cmd/ngent -count=1`
  - `cd internal/webui/web && npm run build`
  - `go test ./...`

## Requirement 23: ACP Session Sidebar and Resume

- Operation:
  - create a thread/agent in the Web UI or API.
  - query `GET /v1/threads/{threadId}/sessions` and verify the first page of ACP sessions plus `nextCursor`.
  - request the next page through the returned cursor.
  - start a turn on a thread without `sessionId` and observe session binding.
  - start a follow-up turn on the now-bound thread.
- Expected:
  - the backend proxies ACP `session/list` through `GET /v1/threads/{threadId}/sessions`.
  - response includes `supported`, `sessions`, and `nextCursor`.
  - for providers that replay transcript over ACP `session/load`, the first `GET /v1/threads/{threadId}/session-history?sessionId=...` warms sqlite `session_transcript_cache`, and later requests can return the same replayed `user` / `assistant` messages without calling the provider again.
  - the Web UI renders a right-side session sidebar with:
    - first-page load on active thread selection.
    - `Show more` pagination when `nextCursor` is present.
  - `New session` action that clears the selected `sessionId`.
  - repeated `New session` clicks while the thread is still unbound must still open a blank fresh-session view instead of reusing the prior anonymous buffer.
  - selecting an existing session requests provider-owned transcript replay before the next turn.
  - turn SSE emits `session_bound`, and the thread persists `agentOptions.sessionId`.
  - once a thread is session-bound, subsequent prompt building no longer injects prior local turns into the provider prompt.
  - cancelled turns that never emitted `session_bound` and never produced visible response text do not reappear when the user opens a newer fresh session or reloads the thread.
- Verification commands (executed 2026-03-13):
  - `go test ./internal/httpapi -run 'TestThreadSessionsListEndpoint|TestTurnSessionBoundPersistsSessionIDAndSkipsContextInjection|TestNewSessionResetSkipsContextInjection' -count=1`
  - `cd internal/webui/web && npm run build`
  - `go test ./...`
- Additional verification commands (executed 2026-03-12):
  - `go test ./internal/agents/kimi -run 'SessionTranscript' -count=1`
  - `go test ./internal/agents/opencode -run 'SessionTranscript' -count=1`
  - `go test ./internal/agents/codex -run 'Test(ConsumeCodexReplayUpdate|DrainCodexReplayUpdates)$' -count=1`
  - `go test ./internal/agents/qwen -run 'SessionTranscript' -count=1`
  - `E2E_QWEN=1 go test ./internal/agents/qwen -run 'TestQwenE2E(Smoke|SessionTranscriptReplay)$' -count=1 -v -timeout 180s`
  - real Qwen provider repro: confirm a locally created Qwen session reappears in `session/list` and `LoadSessionTranscript` replays the unique prompt marker through ACP `session/load`.
- Additional verification commands (executed 2026-03-13):
  - `go test ./internal/storage ./internal/httpapi -run 'Test(SessionTranscriptCacheCRUD|ThreadSessionHistoryEndpoint|ThreadSessionHistoryEndpointUsesSQLiteCacheAcrossRestart)$' -count=1`
  - `go test ./...`
- Additional verification commands (executed 2026-03-16 after fresh-session scope reset fix):
  - `cd internal/webui/web && npm run build`
  - `go test ./...`
  - `go run ./cmd/ngent --port 8798 --db-path /tmp/ngent-session-bug.db --debug`
  - reload the page, reopen the same thread, and confirm the empty cancelled placeholder still does not reappear

## Requirement 24: ACP Slash Commands Cache and Composer Picker

- Operation:
  - run a turn against an ACP-backed agent that emits `available_commands_update`.
  - query `GET /v1/threads/{threadId}/slash-commands`.
  - restart the server and query the same endpoint again.
  - open the Web UI composer for that thread and type `/` into an otherwise empty chat input.
- Expected:
  - built-in ACP providers normalize and accept `available_commands_update`.
  - the server persists the latest slash-command snapshot in SQLite and updates it every time a new snapshot arrives.
  - `GET /v1/threads/{threadId}/slash-commands` returns the cached commands for the thread's agent.
  - the cached slash commands survive server restart.
  - the Web UI shows a selectable slash-command list only when the current composer value starts with `/`.
  - when `GET /v1/threads/{threadId}/slash-commands` returns an empty list, typing `/` leaves the composer responsive and treats `/` as ordinary message input.
  - keyboard navigation and click selection insert the chosen slash command into the composer.
- Verification commands (executed 2026-03-13):
  - `go test ./internal/agents -run TestParseACPUpdateAvailableCommands -count=1`
  - `go test ./internal/storage -run TestAgentSlashCommandsCRUD -count=1`
  - `go test ./internal/httpapi -run 'TestThreadSlashCommandsPersistAndLoad|TestThreadSlashCommandsPersistAcrossRestart' -count=1`
  - `cd internal/webui/web && npm run build`
  - `go test ./...`
- Additional verification commands (executed 2026-03-13):
  - `go run ./cmd/ngent --port 8787 --db-path /tmp/ngent-kimi-real-3.db --debug`
- Additional verification commands (executed 2026-03-13 after Kimi timing fix):
  - `go test ./internal/agents/kimi -run 'TestStream(CapturesSlashCommandsEmittedBeforePrompt|WithFakeProcess|WithFakeProcessModelID)$' -count=1`
  - `go run ./cmd/ngent --port 8788 --db-path /tmp/ngent-kimi-acp-trace.db --debug`
  - real local Kimi thread: confirmed `GET /v1/threads/{threadId}/slash-commands` returned the 8 persisted Kimi commands after the first turn
- Additional verification commands (executed 2026-03-13 after slash-entry refresh fix):
  - `cd internal/webui/web && npm run build`
  - `go test ./...`
  - `go run ./cmd/ngent --port 8789 --db-path /tmp/ngent-slash-refresh.db --debug`
- Additional verification commands (executed 2026-03-13 after codex embedded timing fix):
  - `go test ./internal/agents/codex -run 'TestStream(CapturesSlashCommandsEmittedBeforePrompt|ReplaysCachedSlashCommandsAfterConfigOptionsInit)$' -count=1`
  - `go run ./cmd/ngent --port 8793 --db-path /tmp/ngent-codex-fix.db --debug`
  - real local codex thread: confirmed `GET /v1/threads/{threadId}/slash-commands` returned the 7-command codex snapshot after the first turn
  - sqlite check: `select agent_id, json_array_length(commands_json) from agent_slash_commands where agent_id = 'codex';` returned `codex|7`
- Additional verification commands (executed 2026-03-13 after Qwen/OpenCode stdio timing fix):
  - `go test ./internal/agents/qwen ./internal/agents/opencode -run 'TestStream(CapturesSlashCommandsEmittedBeforePrompt|WithFakeProcess|WithFakeProcessModelID)?$' -count=1`
  - `go run ./cmd/ngent --port 8794 --db-path /tmp/ngent-qwen-opencode-fix.db --debug`
  - real local Qwen thread: confirmed `GET /v1/threads/{threadId}/slash-commands` returned `/bug`, `/compress`, `/init`, `/summary`
  - real local OpenCode thread: confirmed `GET /v1/threads/{threadId}/slash-commands` returned `/init`, `/review`, `/go-style-core`, `/remotion-best-practices`, `/find-skills`, `/compact`
- Additional verification commands (executed 2026-03-13 after stdio notification helper refactor):
  - `go test ./internal/agents/kimi ./internal/agents/qwen ./internal/agents/opencode -run 'TestStream(CapturesSlashCommandsEmittedBeforePrompt|WithFakeProcess|WithFakeProcessModelID)?$' -count=1`
  - `go test ./...`
- Additional verification commands (executed 2026-03-13 after Gemini ACP notification fix):
  - `go test ./internal/agents/gemini -run 'TestStream(CapturesSlashCommandsEmittedBeforePrompt|WithFakeProcess|WithFakeProcessModelID)$' -count=1`
  - `go run ./cmd/ngent --port 8795 --db-path /tmp/ngent-gemini-fix.db --debug`
  - real local Gemini thread: confirmed `GET /v1/threads/{threadId}/slash-commands` still returned `[]`, indicating no provider `available_commands_update` was observed in that run
- Additional verification commands (executed 2026-03-13 after Codex config-init slash-command backfill):
  - `go test ./internal/agents/codex -run 'Test(StreamCapturesSlashCommandsEmittedBeforePrompt|StreamReplaysCachedSlashCommandsAfterConfigOptionsInit|SlashCommandsAfterConfigOptionsInit)$' -count=1`
  - `go test ./internal/httpapi -run 'Test(ThreadSlashCommandsPersistAndLoad|ThreadSlashCommandsPersistAcrossRestart|ThreadConfigOptionsBackfillsSlashCommandsWhenCatalogAlreadyStored)$' -count=1`
  - `go run ./cmd/ngent --port 8796 --db-path /tmp/ngent-codex-slash-fix.db --debug`
  - real local Codex thread: confirmed `GET /v1/threads/{threadId}/config-options` initialized the embedded provider and `GET /v1/threads/{threadId}/slash-commands` then returned the 7-command snapshot before any turn was sent
  - sqlite check: `select agent_id, commands_json from agent_slash_commands where agent_id = 'codex';` returned the persisted codex command list
- Additional verification commands (executed 2026-03-13 after Qwen slash-command probe fallback):
  - `go test ./internal/agents/qwen ./internal/httpapi -run 'Test(StreamCapturesSlashCommandsEmittedBeforePrompt|SlashCommandsAfterConfigOptionsInit|ThreadConfigOptionsBackfillsSlashCommandsWhenCatalogAlreadyStored|ThreadSlashCommandsEndpointBackfillsMissingSnapshot)$' -count=1`
  - `go run ./cmd/ngent --port 8798 --db-path /tmp/ngent-qwen-slash-fix-v2.db --debug`
  - real local Qwen thread: confirmed the very first `GET /v1/threads/{threadId}/slash-commands` returned `/bug`, `/compress`, `/init`, and `/summary` before any turn was sent
  - sqlite check: `select agent_id, commands_json from agent_slash_commands where agent_id = 'qwen';` returned the persisted qwen command list
- Additional verification commands (executed 2026-03-13 after unifying direct ACP provider slash-command caches):
  - `go test ./internal/agents/kimi ./internal/agents/opencode ./internal/agents/gemini ./internal/agents/qwen -run 'Test(StreamCapturesSlashCommandsEmittedBeforePrompt|SlashCommandsAfterConfigOptionsInit|WithFakeProcess|WithFakeProcessModelID)$' -count=1`
  - `go test ./...`
  - Kimi, OpenCode, Gemini, and Qwen now all keep the latest `available_commands_update` snapshot in the same provider-local cache across both `Stream()` and `ConfigOptions()` probes, so `/slash-commands` backfill uses one consistent source for these direct ACP agents

## Requirement 25: ACP Tool-Call Streaming and History

- Operation:
  - run a turn against an ACP-backed agent that emits `tool_call` followed by `tool_call_update` for the same `toolCallId`.
  - observe the SSE stream from `POST /v1/threads/{threadId}/turns`.
  - query `GET /v1/threads/{threadId}/history?includeEvents=true`.
  - open the same thread in the Web UI during streaming and again after reload/history fetch.
- Expected:
  - shared ACP parsing accepts `tool_call` and `tool_call_update` without flattening them into plain text or dropping their structured payload.
  - SSE emits `tool_call` / `tool_call_update` events with `turnId`, `toolCallId`, and the corresponding structured ACP fields (`status`, `content`, `locations`, `rawInput`, `rawOutput`) when present.
  - turn history persists those same event types and payloads.
  - the Web UI merges updates by `toolCallId`, so the same tool-call card progresses from its initial state to its updated/final state both live and after reload.
  - tool-call cards remain separate from the main assistant text bubble.
- Verification commands (executed 2026-03-16):
  - `go test ./internal/agents -run 'TestParseACPUpdateToolCall|TestParseACPUpdateToolCallUpdateKeepsExplicitClears' -count=1`
  - `go test ./internal/agents -run 'TestNewACPNotificationHandlerRoutesToolCallsToToolCallHandler' -count=1`
  - `go test ./internal/httpapi -run 'TestTurnsSSEIncludesToolCallUpdatesAndPersistsHistory' -count=1`
  - `cd internal/webui/web && npm run build`
  - `go test ./...`

## Requirement 26: Codex Image Attachments Use Structured Multimodal Prompt Blocks

- Operation:
  - create a thread using the `codex` agent.
  - upload an image attachment and start a turn with that attachment bound.
  - verify the server behavior both with a multimodal-capable agent and with a plain-text-only fallback agent stub.
- Expected:
  - when the agent implements `ContentStreamer`, ngent sends:
    - one text block containing the existing injected context prompt
    - one image block per bound image attachment, preserving `path` and `mimeType`
  - the embedded Codex runtime receives that image block and produces image-aware output.
  - when the agent does not implement `ContentStreamer`, ngent continues to send the plain injected text prompt with attachment metadata/OCR preview.
- Verification commands (executed 2026-03-17):
  - `PATH=/usr/local/go/bin:$PATH go test ./internal/agents/codex -run 'TestStreamContentPassesImageBlocksToEmbeddedRuntime$' -count=1`
  - `PATH=/usr/local/go/bin:$PATH go test ./internal/httpapi -run 'TestInjectedPromptIncludesAttachmentMetadataAndTextPreview|TestImageAttachmentsUseStructuredPromptWhenAgentSupportsContent' -count=1`
  - `PATH=/usr/local/go/bin:$PATH go test ./...`

## Requirement 27: Mobile Web UI Chat Layout

- Operation:
  - run the embedded Web UI and open it at phone-sized widths (`<=768px`) or on a real mobile browser.
  - inspect the chat header, empty state, composer, attachment chips, and new-thread modal with and without pending uploads.
- Expected:
  - the mobile header wraps cleanly without clipping the title, agent badge, or storage usage pill.
  - the empty state and message list use reduced vertical padding so the composer remains visible above the fold.
  - the composer stacks controls for touch use: textarea first, config pickers beneath, and upload/send actions in a full-width row.
  - bottom controls and modals respect browser safe areas and do not sit flush against notches or bottom bars.
- Verification commands (executed 2026-03-17):
  - `cd internal/webui/web && npm run build`
  - `PATH=/usr/local/go/bin:$PATH go test ./...`
  - manual: `make run` -> open `http://127.0.0.1:8686/` on a phone or responsive emulator, confirm the mobile layout matches the expected stacked composer and compact header behavior

## Requirement 28: Refresh Recovers Active Thread And Mobile Can Start Fresh Sessions

- Operation:
  - open the Web UI with at least one existing thread.
  - hard-refresh the page.
  - on a phone-width viewport, open the restored thread and use the chat-header `新会话` action.
- Expected:
  - when thread data exists, reload selects the newest available thread instead of falling back to the empty `未选择 Agent` page.
  - this recovery does not require persisting runtime chat state in localStorage.
  - on mobile, the chat header exposes a visible `新会话` action even though the desktop session sidebar is hidden.
- Verification commands (executed 2026-03-17):
  - `cd internal/webui/web && npm run build`
  - `PATH=/usr/local/go/bin:$PATH go test ./...`
  - manual: refresh the page with existing threads present, confirm the newest thread is opened automatically; in a phone-width viewport confirm tapping `新会话` switches the thread into a fresh session scope

## Requirement 29: Mobile Sidebar Backdrop Dismissal

- Operation:
  - open the Web UI on a phone-width viewport.
  - open the left sidebar from the hamburger button.
  - tap the dimmed content area outside the drawer.
- Expected:
  - a visible backdrop appears behind the sidebar drawer while it is open.
  - tapping the backdrop closes the drawer.
  - the mobile `新会话` CTA remains visible in the chat header's primary area after the drawer closes.
- Verification commands (executed 2026-03-17):
  - `cd internal/webui/web && npm run build`
  - `PATH=/usr/local/go/bin:$PATH go test ./...`
  - manual: on a phone or responsive emulator, open the sidebar, tap outside it to dismiss, then confirm the `新会话` button is visible in the chat header

## Requirement 30: Mobile Session List Bottom Sheet

- Operation:
  - open the Web UI on a phone-width viewport with an active thread.
  - tap the mobile chat-header `会话` button.
  - inspect the opened session list and switch to another session or create a fresh one.
- Expected:
  - a bottom-sheet session list opens on mobile.
  - the sheet reuses the same session data and actions as the desktop right-side session panel.
  - tapping a session switches to it, and tapping `新建会话` starts a fresh session.
- Verification commands (executed 2026-03-18):
  - `cd internal/webui/web && npm run build`
  - `PATH=/usr/local/go/bin:$PATH go test ./...`

## Requirement 31: Streaming Completion Must Not Force Scroll And Bubble Shell Must Be Visible Immediately

- Operation:
  - open a thread with enough history that the message list can scroll.
  - start a long-running model turn, then scroll to the top or middle while the response is still streaming.
  - wait for the turn to complete.
- Expected:
  - streaming deltas only auto-follow while the user remains near the bottom of the message list.
  - when the final completed message replaces the streaming placeholder, the viewport remains at the user's current scroll position instead of jumping to the bottom.
  - the streaming agent bubble uses the same full bubble shell layout immediately, without waiting for the final markdown render pass.
- Verification commands (executed 2026-03-18):
  - `cd internal/webui/web && npm run build`
  - `PATH=/usr/local/go/bin:$PATH go test ./...`
  - manual: start a long response, scroll away from the bottom mid-stream, confirm completion does not yank the list; start another response and confirm the streaming bubble shows full-width bubble chrome as soon as it appears

## Requirement 32: Markdown Code Blocks Must Highlight Common Fence Labels And Unknown Fences Gracefully

- Operation:
  - render finalized agent markdown containing fenced code blocks labeled with common model-emitted names such as `shell`, `tsx`, `jsx`, and `html`.
  - also render a fenced code block with no language or with a label outside the explicit registration list.
- Expected:
  - supported aliases resolve to a registered highlighter and produce `hljs-*` token markup.
  - unlabeled or unrecognized fenced code blocks still receive automatic syntax highlighting when highlight.js can infer a language.
  - code block copy/fold controls continue to work unchanged.
- Verification commands (executed 2026-03-18):
  - `cd internal/webui/web && npm run build`
  - `PATH=/usr/local/go/bin:$PATH go test ./...`
  - manual: ask the model for fenced `shell` and `tsx` code examples, confirm the final rendered code block contains colored syntax instead of a flat monospace block

## Requirement 33: Prototype-Aligned Web UI Shell

- Operation:
  - open the embedded Web UI with at least one existing thread.
  - compare the default shell against the supplied `index.html` prototype, including sidebar, header, message area, and composer.
  - open and close the session overlay from the chat header.
- Expected:
  - the left rail uses the prototype's dark treatment and grouped conversation list styling.
  - the main chat area uses a centered white canvas with light-gray user bubbles and plain-text assistant output.
  - the composer uses a floating rounded light-gray shell with compact accessory controls.
  - session browsing opens in an overlay sheet so the desktop canvas remains visually aligned with the prototype.
- Verification commands (executed 2026-03-18):
  - `cd internal/webui/web && npm run build`
  - Playwright smoke via `with_server.py` and mocked `/v1/*` responses
  - pending follow-up: `go test ./...` and live-server manual verification on a host with Go available
