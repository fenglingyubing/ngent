package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var (
	// ErrNotFound indicates the requested record does not exist.
	ErrNotFound = errors.New("storage: not found")
	// ErrConflict indicates the requested mutation conflicts with current state.
	ErrConflict = errors.New("storage: conflict")
	// ErrQuotaExceeded indicates chat-asset usage cannot be reduced within quota.
	ErrQuotaExceeded = errors.New("storage: quota exceeded")
)

// DefaultAgentConfigCatalogModelID is the synthetic model key used for the
// agent's default config-options snapshot.
const DefaultAgentConfigCatalogModelID = "__agent_hub_default__"

// GlobalStorageUsageScope is the singleton scope key for chat asset storage.
const GlobalStorageUsageScope = "global"

// DefaultChatAssetQuotaBytes is the default global chat asset quota: 5 GiB.
const DefaultChatAssetQuotaBytes int64 = 5 * 1024 * 1024 * 1024

// Store wraps SQLite-backed persistence operations.
type Store struct {
	path string
	db   *sql.DB
	now  func() time.Time
}

// Thread stores one persisted thread row.
type Thread struct {
	ThreadID         string
	ClientID         string
	AgentID          string
	CWD              string
	Title            string
	AgentOptionsJSON string
	Summary          string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// CreateThreadParams contains input for CreateThread.
type CreateThreadParams struct {
	ThreadID         string
	ClientID         string
	AgentID          string
	CWD              string
	Title            string
	AgentOptionsJSON string
	Summary          string
}

// AgentConfigCatalog stores one persisted agent/model config-options snapshot.
type AgentConfigCatalog struct {
	AgentID           string
	ModelID           string
	ConfigOptionsJSON string
	UpdatedAt         time.Time
}

// UpsertAgentConfigCatalogParams contains input for UpsertAgentConfigCatalog.
type UpsertAgentConfigCatalogParams struct {
	AgentID           string
	ModelID           string
	ConfigOptionsJSON string
}

// AgentSlashCommands stores one persisted agent slash-command snapshot.
type AgentSlashCommands struct {
	AgentID      string
	CommandsJSON string
	UpdatedAt    time.Time
}

// UpsertAgentSlashCommandsParams contains input for UpsertAgentSlashCommands.
type UpsertAgentSlashCommandsParams struct {
	AgentID      string
	CommandsJSON string
}

// SessionTranscriptCache stores one persisted provider session transcript snapshot.
type SessionTranscriptCache struct {
	AgentID      string
	CWD          string
	SessionID    string
	MessagesJSON string
	UpdatedAt    time.Time
}

// UpsertSessionTranscriptCacheParams contains input for UpsertSessionTranscriptCache.
type UpsertSessionTranscriptCacheParams struct {
	AgentID      string
	CWD          string
	SessionID    string
	MessagesJSON string
}

// Turn stores one persisted turn row.
type Turn struct {
	TurnID       string
	ThreadID     string
	RequestText  string
	ResponseText string
	IsInternal   bool
	Status       string
	StopReason   string
	ErrorMessage string
	CreatedAt    time.Time
	CompletedAt  *time.Time
}

// CreateTurnParams contains input for CreateTurn.
type CreateTurnParams struct {
	TurnID      string
	ThreadID    string
	RequestText string
	Status      string
	IsInternal  bool
}

// FinalizeTurnParams contains fields used to close a turn.
type FinalizeTurnParams struct {
	TurnID       string
	ResponseText string
	Status       string
	StopReason   string
	ErrorMessage string
}

// Event stores one persisted turn event row.
type Event struct {
	EventID   int64
	TurnID    string
	Seq       int
	Type      string
	DataJSON  string
	CreatedAt time.Time
}

// Upload stores one persisted chat asset row.
type Upload struct {
	UploadID       string
	ClientID       string
	ThreadID       string
	TurnID         string
	Role           string
	Kind           string
	Status         string
	OriginName     string
	StoredName     string
	MIMEType       string
	SizeBytes      int64
	StoragePath    string
	ThumbnailPath  string
	SHA256         string
	CreatedAt      time.Time
	LastAccessedAt time.Time
	DeletedAt      *time.Time
}

// CreateUploadParams contains input for CreateUpload.
type CreateUploadParams struct {
	UploadID      string
	ClientID      string
	ThreadID      string
	TurnID        string
	Role          string
	Kind          string
	Status        string
	OriginName    string
	StoredName    string
	MIMEType      string
	SizeBytes     int64
	StoragePath   string
	ThumbnailPath string
	SHA256        string
}

// UpdateUploadStorageParams contains fields used to bind upload storage metadata.
type UpdateUploadStorageParams struct {
	UploadID       string
	ThreadID       string
	TurnID         string
	Status         string
	LastAccessedAt time.Time
}

// BindUploadsToTurnParams contains fields used to attach uploads to one turn.
type BindUploadsToTurnParams struct {
	ClientID  string
	ThreadID  string
	TurnID    string
	Role      string
	UploadIDs []string
}

// StorageUsage stores one persisted storage quota row.
type StorageUsage struct {
	Scope     string
	UsedBytes int64
	MaxBytes  int64
	UpdatedAt time.Time
}

// DeleteUploadResult describes one soft-deleted upload and reclaimed bytes.
type DeleteUploadResult struct {
	Upload          Upload
	RemovedBytes    int64
	OriginalExists  bool
	ThumbnailExists bool
}

// QuotaCleanupResult describes one automatic quota cleanup pass.
type QuotaCleanupResult struct {
	Deleted        []DeleteUploadResult
	Usage          StorageUsage
	RemovedBytes   int64
	DeletedUploads int
	TargetBytes    int64
}

// New opens the SQLite database and applies idempotent migrations.
func New(path string) (*Store, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("storage: empty database path")
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("storage: open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)

	store := &Store{
		path: path,
		db:   db,
		now:  time.Now,
	}

	if err := store.configure(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := store.Migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := store.ensureDefaultStorageUsage(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

// DefaultAssetsDir returns the default filesystem root for chat assets.
func DefaultAssetsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home dir: %w", err)
	}
	home = strings.TrimSpace(home)
	if home == "" {
		return "", errors.New("user home dir is empty")
	}
	return filepath.Join(home, ".ngent", "assets"), nil
}

// EnsureAssetsDir creates the chat asset root directory when missing.
func EnsureAssetsDir(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return errors.New("storage: assets dir is empty")
	}
	if err := os.MkdirAll(path, 0o755); err != nil {
		return fmt.Errorf("storage: create assets dir %q: %w", path, err)
	}
	return nil
}

// Close closes the underlying database handle.
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// Migrate applies all pending migrations and records versions in schema_migrations.
func (s *Store) Migrate(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}

	if _, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TEXT NOT NULL
		);
	`); err != nil {
		return fmt.Errorf("storage: create schema_migrations: %w", err)
	}

	for _, m := range migrations {
		applied, err := s.migrationApplied(ctx, m.version)
		if err != nil {
			return err
		}
		if applied {
			continue
		}
		if err := s.applyMigration(ctx, m); err != nil {
			return err
		}
	}

	return nil
}

// UpsertClient creates a client row or updates its last_seen_at.
func (s *Store) UpsertClient(ctx context.Context, clientID string) error {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return errors.New("storage: clientID is required")
	}

	ts := formatTime(s.now())
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO clients (client_id, created_at, last_seen_at)
		VALUES (?, ?, ?)
		ON CONFLICT(client_id) DO UPDATE SET last_seen_at = excluded.last_seen_at;
	`, clientID, ts, ts); err != nil {
		return fmt.Errorf("storage: upsert client: %w", err)
	}

	return nil
}

// CreateUpload inserts one chat asset row.
func (s *Store) CreateUpload(ctx context.Context, params CreateUploadParams) (Upload, error) {
	if strings.TrimSpace(params.UploadID) == "" {
		return Upload{}, errors.New("storage: uploadID is required")
	}
	if strings.TrimSpace(params.ClientID) == "" {
		return Upload{}, errors.New("storage: clientID is required")
	}
	if strings.TrimSpace(params.Role) == "" {
		return Upload{}, errors.New("storage: role is required")
	}
	if strings.TrimSpace(params.Kind) == "" {
		return Upload{}, errors.New("storage: kind is required")
	}
	if strings.TrimSpace(params.Status) == "" {
		return Upload{}, errors.New("storage: status is required")
	}
	if strings.TrimSpace(params.OriginName) == "" {
		return Upload{}, errors.New("storage: originName is required")
	}
	if strings.TrimSpace(params.StoredName) == "" {
		return Upload{}, errors.New("storage: storedName is required")
	}
	if strings.TrimSpace(params.MIMEType) == "" {
		return Upload{}, errors.New("storage: mimeType is required")
	}
	if params.SizeBytes < 0 {
		return Upload{}, errors.New("storage: sizeBytes must be non-negative")
	}
	if strings.TrimSpace(params.StoragePath) == "" {
		return Upload{}, errors.New("storage: storagePath is required")
	}

	now := s.now().UTC()
	nowText := formatTime(now)
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO uploads (
			upload_id,
			client_id,
			thread_id,
			turn_id,
			role,
			kind,
			status,
			origin_name,
			stored_name,
			mime_type,
			size_bytes,
			storage_path,
			thumbnail_path,
			sha256,
			created_at,
			last_accessed_at,
			deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '');
	`,
		params.UploadID,
		params.ClientID,
		params.ThreadID,
		params.TurnID,
		params.Role,
		params.Kind,
		params.Status,
		params.OriginName,
		params.StoredName,
		params.MIMEType,
		params.SizeBytes,
		params.StoragePath,
		params.ThumbnailPath,
		params.SHA256,
		nowText,
		nowText,
	); err != nil {
		return Upload{}, fmt.Errorf("storage: create upload: %w", err)
	}

	return Upload{
		UploadID:       params.UploadID,
		ClientID:       params.ClientID,
		ThreadID:       params.ThreadID,
		TurnID:         params.TurnID,
		Role:           params.Role,
		Kind:           params.Kind,
		Status:         params.Status,
		OriginName:     params.OriginName,
		StoredName:     params.StoredName,
		MIMEType:       params.MIMEType,
		SizeBytes:      params.SizeBytes,
		StoragePath:    params.StoragePath,
		ThumbnailPath:  params.ThumbnailPath,
		SHA256:         params.SHA256,
		CreatedAt:      now,
		LastAccessedAt: now,
	}, nil
}

// GetUpload returns one upload by upload_id.
func (s *Store) GetUpload(ctx context.Context, uploadID string) (Upload, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT
			upload_id,
			client_id,
			thread_id,
			turn_id,
			role,
			kind,
			status,
			origin_name,
			stored_name,
			mime_type,
			size_bytes,
			storage_path,
			thumbnail_path,
			sha256,
			created_at,
			last_accessed_at,
			deleted_at
		FROM uploads
		WHERE upload_id = ?;
	`, uploadID)
	item, err := scanUpload(row)
	if err != nil {
		return Upload{}, fmt.Errorf("storage: get upload: %w", err)
	}
	return item, nil
}

// ListUploadsByClient returns uploads for one client ordered by created_at ascending.
func (s *Store) ListUploadsByClient(ctx context.Context, clientID string) ([]Upload, error) {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return nil, errors.New("storage: clientID is required")
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			upload_id,
			client_id,
			thread_id,
			turn_id,
			role,
			kind,
			status,
			origin_name,
			stored_name,
			mime_type,
			size_bytes,
			storage_path,
			thumbnail_path,
			sha256,
			created_at,
			last_accessed_at,
			deleted_at
		FROM uploads
		WHERE client_id = ?
		ORDER BY created_at ASC, upload_id ASC;
	`, clientID)
	if err != nil {
		return nil, fmt.Errorf("storage: list uploads by client: %w", err)
	}
	defer rows.Close()

	var out []Upload
	for rows.Next() {
		item, err := scanUpload(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: iterate uploads by client: %w", err)
	}
	return out, nil
}

// BindUploadsToTurn binds uploaded assets to one turn atomically.
func (s *Store) BindUploadsToTurn(ctx context.Context, params BindUploadsToTurnParams) ([]Upload, error) {
	if strings.TrimSpace(params.ClientID) == "" {
		return nil, errors.New("storage: clientID is required")
	}
	if strings.TrimSpace(params.ThreadID) == "" {
		return nil, errors.New("storage: threadID is required")
	}
	if strings.TrimSpace(params.TurnID) == "" {
		return nil, errors.New("storage: turnID is required")
	}
	if strings.TrimSpace(params.Role) == "" {
		return nil, errors.New("storage: role is required")
	}

	normalizedIDs := make([]string, 0, len(params.UploadIDs))
	seen := make(map[string]struct{}, len(params.UploadIDs))
	for _, rawID := range params.UploadIDs {
		uploadID := strings.TrimSpace(rawID)
		if uploadID == "" {
			return nil, errors.New("storage: uploadID is required")
		}
		if _, exists := seen[uploadID]; exists {
			continue
		}
		seen[uploadID] = struct{}{}
		normalizedIDs = append(normalizedIDs, uploadID)
	}
	if len(normalizedIDs) == 0 {
		return []Upload{}, nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("storage: begin bind uploads tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	now := s.now().UTC()
	nowText := formatTime(now)
	bound := make([]Upload, 0, len(normalizedIDs))
	for _, uploadID := range normalizedIDs {
		row := tx.QueryRowContext(ctx, `
			SELECT
				upload_id,
				client_id,
				thread_id,
				turn_id,
				role,
				kind,
				status,
				origin_name,
				stored_name,
				mime_type,
				size_bytes,
				storage_path,
				thumbnail_path,
				sha256,
				created_at,
				last_accessed_at,
				deleted_at
			FROM uploads
			WHERE upload_id = ?;
		`, uploadID)
		item, err := scanUpload(row)
		if err != nil {
			return nil, err
		}
		if item.ClientID != params.ClientID {
			return nil, ErrNotFound
		}
		if item.Status == "deleted" || item.DeletedAt != nil {
			return nil, ErrConflict
		}
		if item.Status != "uploaded" {
			return nil, ErrConflict
		}
		if strings.TrimSpace(item.ThreadID) != "" || strings.TrimSpace(item.TurnID) != "" {
			return nil, ErrConflict
		}

		if _, err := tx.ExecContext(ctx, `
			UPDATE uploads
			SET thread_id = ?, turn_id = ?, role = ?, status = ?, last_accessed_at = ?
			WHERE upload_id = ?;
		`, params.ThreadID, params.TurnID, params.Role, "attached", nowText, uploadID); err != nil {
			return nil, fmt.Errorf("storage: bind upload to turn: %w", err)
		}
		item.ThreadID = params.ThreadID
		item.TurnID = params.TurnID
		item.Role = params.Role
		item.Status = "attached"
		item.LastAccessedAt = now
		bound = append(bound, item)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("storage: commit bind uploads tx: %w", err)
	}
	return bound, nil
}

// ListUploadsByTurn returns uploads already attached to one turn.
func (s *Store) ListUploadsByTurn(ctx context.Context, turnID string) ([]Upload, error) {
	turnID = strings.TrimSpace(turnID)
	if turnID == "" {
		return nil, errors.New("storage: turnID is required")
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			upload_id,
			client_id,
			thread_id,
			turn_id,
			role,
			kind,
			status,
			origin_name,
			stored_name,
			mime_type,
			size_bytes,
			storage_path,
			thumbnail_path,
			sha256,
			created_at,
			last_accessed_at,
			deleted_at
		FROM uploads
		WHERE turn_id = ?
		ORDER BY created_at ASC, upload_id ASC;
	`, turnID)
	if err != nil {
		return nil, fmt.Errorf("storage: list uploads by turn: %w", err)
	}
	defer rows.Close()

	var out []Upload
	for rows.Next() {
		item, err := scanUpload(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: iterate uploads by turn: %w", err)
	}
	return out, nil
}

// GetStorageUsage returns the usage row for one scope.
func (s *Store) GetStorageUsage(ctx context.Context, scope string) (StorageUsage, error) {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		return StorageUsage{}, errors.New("storage: scope is required")
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT scope, used_bytes, max_bytes, updated_at
		FROM storage_usage
		WHERE scope = ?;
	`, scope)
	var usage StorageUsage
	var updatedAtDB string
	if err := row.Scan(&usage.Scope, &usage.UsedBytes, &usage.MaxBytes, &updatedAtDB); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return StorageUsage{}, ErrNotFound
		}
		return StorageUsage{}, fmt.Errorf("storage: get storage usage: %w", err)
	}
	updatedAt, err := parseTime(updatedAtDB)
	if err != nil {
		return StorageUsage{}, fmt.Errorf("storage: parse storage usage updated_at: %w", err)
	}
	usage.UpdatedAt = updatedAt
	return usage, nil
}

// AddStorageUsageBytes increments used_bytes for one scope.
func (s *Store) AddStorageUsageBytes(ctx context.Context, scope string, delta int64) error {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		return errors.New("storage: scope is required")
	}
	nowText := formatTime(s.now())
	result, err := s.db.ExecContext(ctx, `
		UPDATE storage_usage
		SET used_bytes = CASE WHEN used_bytes + ? < 0 THEN 0 ELSE used_bytes + ? END, updated_at = ?
		WHERE scope = ?;
	`, delta, delta, nowText, scope)
	if err != nil {
		return fmt.Errorf("storage: add storage usage bytes: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("storage: add storage usage rows affected: %w", err)
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateStorageUsageLimit updates max_bytes for one scope.
func (s *Store) UpdateStorageUsageLimit(ctx context.Context, scope string, maxBytes int64) error {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		return errors.New("storage: scope is required")
	}
	if maxBytes < 0 {
		return errors.New("storage: maxBytes must be non-negative")
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE storage_usage
		SET max_bytes = ?, updated_at = ?
		WHERE scope = ?;
	`, maxBytes, formatTime(s.now()), scope)
	if err != nil {
		return fmt.Errorf("storage: update storage usage limit: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("storage: update storage usage limit rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// RecalculateStorageUsage scans persisted uploads and rewrites used_bytes
// to match the actual asset files currently present on disk.
func (s *Store) RecalculateStorageUsage(ctx context.Context, scope string) (StorageUsage, error) {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		return StorageUsage{}, errors.New("storage: scope is required")
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT storage_path, thumbnail_path
		FROM uploads
		WHERE status != 'deleted' AND deleted_at = '';
	`)
	if err != nil {
		return StorageUsage{}, fmt.Errorf("storage: list uploads for usage recalculation: %w", err)
	}
	defer rows.Close()

	var usedBytes int64
	for rows.Next() {
		var storagePath, thumbnailPath string
		if err := rows.Scan(&storagePath, &thumbnailPath); err != nil {
			return StorageUsage{}, fmt.Errorf("storage: scan usage recalculation row: %w", err)
		}
		size, err := fileSizeIfExists(strings.TrimSpace(storagePath))
		if err != nil {
			return StorageUsage{}, fmt.Errorf("storage: stat upload file: %w", err)
		}
		usedBytes += size

		thumbSize, err := fileSizeIfExists(strings.TrimSpace(thumbnailPath))
		if err != nil {
			return StorageUsage{}, fmt.Errorf("storage: stat upload thumbnail: %w", err)
		}
		usedBytes += thumbSize
	}
	if err := rows.Err(); err != nil {
		return StorageUsage{}, fmt.Errorf("storage: iterate usage recalculation rows: %w", err)
	}

	nowText := formatTime(s.now())
	result, err := s.db.ExecContext(ctx, `
		UPDATE storage_usage
		SET used_bytes = ?, updated_at = ?
		WHERE scope = ?;
	`, usedBytes, nowText, scope)
	if err != nil {
		return StorageUsage{}, fmt.Errorf("storage: rewrite storage usage: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return StorageUsage{}, fmt.Errorf("storage: rewrite storage usage rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return StorageUsage{}, ErrNotFound
	}
	return s.GetStorageUsage(ctx, scope)
}

// CleanupStorageUsageToLimit deletes the oldest non-deleted uploads until used_bytes
// is less than or equal to targetBytes. When targetBytes cannot be reached because no
// deletable uploads remain, ErrQuotaExceeded is returned alongside the partial result.
func (s *Store) CleanupStorageUsageToLimit(ctx context.Context, scope string, targetBytes int64) (QuotaCleanupResult, error) {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		return QuotaCleanupResult{}, errors.New("storage: scope is required")
	}
	if targetBytes < 0 {
		targetBytes = 0
	}

	usage, err := s.GetStorageUsage(ctx, scope)
	if err != nil {
		return QuotaCleanupResult{}, err
	}

	result := QuotaCleanupResult{
		Usage:       usage,
		TargetBytes: targetBytes,
	}
	if usage.UsedBytes <= targetBytes {
		return result, nil
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT
			upload_id,
			client_id,
			thread_id,
			turn_id,
			role,
			kind,
			status,
			origin_name,
			stored_name,
			mime_type,
			size_bytes,
			storage_path,
			thumbnail_path,
			sha256,
			created_at,
			last_accessed_at,
			deleted_at
		FROM uploads
		WHERE status != 'deleted' AND deleted_at = ''
		ORDER BY created_at ASC, upload_id ASC;
	`)
	if err != nil {
		return result, fmt.Errorf("storage: list uploads for quota cleanup: %w", err)
	}
	defer rows.Close()

	candidates := make([]Upload, 0)
	for rows.Next() {
		item, err := scanUpload(rows)
		if err != nil {
			return result, err
		}
		candidates = append(candidates, item)
	}
	if err := rows.Err(); err != nil {
		return result, fmt.Errorf("storage: iterate quota cleanup uploads: %w", err)
	}

	for _, item := range candidates {
		if result.Usage.UsedBytes <= targetBytes {
			break
		}

		deleteResult, err := s.deleteUploadByID(ctx, item.UploadID)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				continue
			}
			return result, err
		}
		result.Deleted = append(result.Deleted, deleteResult)
		result.RemovedBytes += deleteResult.RemovedBytes
		result.DeletedUploads++

		result.Usage, err = s.GetStorageUsage(ctx, scope)
		if err != nil {
			return result, err
		}
	}

	if result.Usage.UsedBytes > targetBytes {
		return result, ErrQuotaExceeded
	}
	return result, nil
}

// DeleteUpload soft-deletes one upload for its owning client.
func (s *Store) DeleteUpload(ctx context.Context, clientID, uploadID string) (DeleteUploadResult, error) {
	clientID = strings.TrimSpace(clientID)
	uploadID = strings.TrimSpace(uploadID)
	if clientID == "" {
		return DeleteUploadResult{}, errors.New("storage: clientID is required")
	}
	if uploadID == "" {
		return DeleteUploadResult{}, errors.New("storage: uploadID is required")
	}

	item, err := s.GetUpload(ctx, uploadID)
	if err != nil {
		return DeleteUploadResult{}, err
	}
	if item.ClientID != clientID {
		return DeleteUploadResult{}, ErrNotFound
	}
	return s.deleteUploadByID(ctx, uploadID)
}

// CreateThread inserts one thread row.
func (s *Store) CreateThread(ctx context.Context, params CreateThreadParams) (Thread, error) {
	if strings.TrimSpace(params.ThreadID) == "" {
		return Thread{}, errors.New("storage: threadID is required")
	}
	if strings.TrimSpace(params.ClientID) == "" {
		return Thread{}, errors.New("storage: clientID is required")
	}
	if strings.TrimSpace(params.AgentID) == "" {
		return Thread{}, errors.New("storage: agentID is required")
	}
	if strings.TrimSpace(params.CWD) == "" {
		return Thread{}, errors.New("storage: cwd is required")
	}
	if strings.TrimSpace(params.AgentOptionsJSON) == "" {
		params.AgentOptionsJSON = "{}"
	}

	now := s.now().UTC()
	nowText := formatTime(now)

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO threads (
			thread_id,
			client_id,
			agent_id,
			cwd,
			title,
			agent_options_json,
			summary,
			created_at,
			updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
	`,
		params.ThreadID,
		params.ClientID,
		params.AgentID,
		params.CWD,
		params.Title,
		params.AgentOptionsJSON,
		params.Summary,
		nowText,
		nowText,
	); err != nil {
		return Thread{}, fmt.Errorf("storage: create thread: %w", err)
	}

	return Thread{
		ThreadID:         params.ThreadID,
		ClientID:         params.ClientID,
		AgentID:          params.AgentID,
		CWD:              params.CWD,
		Title:            params.Title,
		AgentOptionsJSON: params.AgentOptionsJSON,
		Summary:          params.Summary,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

// GetThread returns one thread by thread_id.
func (s *Store) GetThread(ctx context.Context, threadID string) (Thread, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT
			thread_id,
			client_id,
			agent_id,
			cwd,
			title,
			agent_options_json,
			summary,
			created_at,
			updated_at
		FROM threads
		WHERE thread_id = ?;
	`, threadID)

	var (
		thread      Thread
		createdAtDB string
		updatedAtDB string
	)
	if err := row.Scan(
		&thread.ThreadID,
		&thread.ClientID,
		&thread.AgentID,
		&thread.CWD,
		&thread.Title,
		&thread.AgentOptionsJSON,
		&thread.Summary,
		&createdAtDB,
		&updatedAtDB,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Thread{}, ErrNotFound
		}
		return Thread{}, fmt.Errorf("storage: get thread: %w", err)
	}

	createdAt, err := parseTime(createdAtDB)
	if err != nil {
		return Thread{}, fmt.Errorf("storage: parse thread.created_at: %w", err)
	}
	updatedAt, err := parseTime(updatedAtDB)
	if err != nil {
		return Thread{}, fmt.Errorf("storage: parse thread.updated_at: %w", err)
	}

	thread.CreatedAt = createdAt
	thread.UpdatedAt = updatedAt
	return thread, nil
}

// DeleteThread removes one thread and its dependent turns/events.
func (s *Store) DeleteThread(ctx context.Context, threadID string) error {
	threadID = strings.TrimSpace(threadID)
	if threadID == "" {
		return errors.New("storage: threadID is required")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("storage: begin delete thread tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM events
		WHERE turn_id IN (
			SELECT turn_id
			FROM turns
			WHERE thread_id = ?
		);
	`, threadID); err != nil {
		return fmt.Errorf("storage: delete thread events: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM turns
		WHERE thread_id = ?;
	`, threadID); err != nil {
		return fmt.Errorf("storage: delete thread turns: %w", err)
	}

	result, err := tx.ExecContext(ctx, `
		DELETE FROM threads
		WHERE thread_id = ?;
	`, threadID)
	if err != nil {
		return fmt.Errorf("storage: delete thread: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("storage: delete thread rows affected: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("storage: commit delete thread tx: %w", err)
	}
	return nil
}

// UpdateThreadSummary updates one thread summary and updates updated_at timestamp.
func (s *Store) UpdateThreadSummary(ctx context.Context, threadID, summary string) error {
	if strings.TrimSpace(threadID) == "" {
		return errors.New("storage: threadID is required")
	}

	result, err := s.db.ExecContext(ctx, `
		UPDATE threads
		SET
			summary = ?,
			updated_at = ?
		WHERE thread_id = ?;
	`, summary, formatTime(s.now()), threadID)
	if err != nil {
		return fmt.Errorf("storage: update thread summary: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("storage: update thread summary rows affected: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateThreadTitle updates one thread title and updates updated_at timestamp.
func (s *Store) UpdateThreadTitle(ctx context.Context, threadID, title string) error {
	if strings.TrimSpace(threadID) == "" {
		return errors.New("storage: threadID is required")
	}

	result, err := s.db.ExecContext(ctx, `
		UPDATE threads
		SET
			title = ?,
			updated_at = ?
		WHERE thread_id = ?;
	`, title, formatTime(s.now()), threadID)
	if err != nil {
		return fmt.Errorf("storage: update thread title: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("storage: update thread title rows affected: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateThreadAgentOptions updates one thread agent options and updates updated_at timestamp.
func (s *Store) UpdateThreadAgentOptions(ctx context.Context, threadID, agentOptionsJSON string) error {
	if strings.TrimSpace(threadID) == "" {
		return errors.New("storage: threadID is required")
	}
	if strings.TrimSpace(agentOptionsJSON) == "" {
		agentOptionsJSON = "{}"
	}

	result, err := s.db.ExecContext(ctx, `
		UPDATE threads
		SET
			agent_options_json = ?,
			updated_at = ?
		WHERE thread_id = ?;
	`, agentOptionsJSON, formatTime(s.now()), threadID)
	if err != nil {
		return fmt.Errorf("storage: update thread agent options: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("storage: update thread agent options rows affected: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// UpsertAgentConfigCatalog stores one agent/model config-options snapshot.
func (s *Store) UpsertAgentConfigCatalog(ctx context.Context, params UpsertAgentConfigCatalogParams) error {
	if strings.TrimSpace(params.AgentID) == "" {
		return errors.New("storage: agentID is required")
	}
	if strings.TrimSpace(params.ModelID) == "" {
		return errors.New("storage: modelID is required")
	}
	if strings.TrimSpace(params.ConfigOptionsJSON) == "" {
		params.ConfigOptionsJSON = "[]"
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_config_catalogs (
			agent_id,
			model_id,
			config_options_json,
			updated_at
		) VALUES (?, ?, ?, ?)
		ON CONFLICT(agent_id, model_id) DO UPDATE SET
			config_options_json = excluded.config_options_json,
			updated_at = excluded.updated_at;
	`,
		params.AgentID,
		params.ModelID,
		params.ConfigOptionsJSON,
		formatTime(s.now()),
	); err != nil {
		return fmt.Errorf("storage: upsert agent config catalog: %w", err)
	}

	return nil
}

// GetAgentSlashCommands returns the stored slash-command snapshot for one agent.
func (s *Store) GetAgentSlashCommands(ctx context.Context, agentID string) (AgentSlashCommands, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT
			agent_id,
			commands_json,
			updated_at
		FROM agent_slash_commands
		WHERE agent_id = ?;
	`, strings.TrimSpace(agentID))

	var (
		commands    AgentSlashCommands
		updatedAtDB string
	)
	if err := row.Scan(&commands.AgentID, &commands.CommandsJSON, &updatedAtDB); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AgentSlashCommands{}, ErrNotFound
		}
		return AgentSlashCommands{}, fmt.Errorf("storage: get agent slash commands: %w", err)
	}

	updatedAt, err := parseTime(updatedAtDB)
	if err != nil {
		return AgentSlashCommands{}, fmt.Errorf("storage: parse agent slash commands.updated_at: %w", err)
	}
	commands.UpdatedAt = updatedAt
	return commands, nil
}

// UpsertAgentSlashCommands stores one agent slash-command snapshot.
func (s *Store) UpsertAgentSlashCommands(ctx context.Context, params UpsertAgentSlashCommandsParams) error {
	if strings.TrimSpace(params.AgentID) == "" {
		return errors.New("storage: agentID is required")
	}
	if strings.TrimSpace(params.CommandsJSON) == "" {
		params.CommandsJSON = "[]"
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_slash_commands (
			agent_id,
			commands_json,
			updated_at
		) VALUES (?, ?, ?)
		ON CONFLICT(agent_id) DO UPDATE SET
			commands_json = excluded.commands_json,
			updated_at = excluded.updated_at;
	`,
		strings.TrimSpace(params.AgentID),
		params.CommandsJSON,
		formatTime(s.now()),
	); err != nil {
		return fmt.Errorf("storage: upsert agent slash commands: %w", err)
	}

	return nil
}

// ReplaceAgentConfigCatalogs atomically replaces all stored catalogs for one agent.
func (s *Store) ReplaceAgentConfigCatalogs(ctx context.Context, agentID string, params []UpsertAgentConfigCatalogParams) error {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return errors.New("storage: agentID is required")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("storage: begin replace agent config catalogs tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM agent_config_catalogs
		WHERE agent_id = ?;
	`, agentID); err != nil {
		return fmt.Errorf("storage: delete agent config catalogs: %w", err)
	}

	updatedAt := formatTime(s.now())
	for _, param := range params {
		if err := upsertAgentConfigCatalogTx(ctx, tx, updatedAt, agentID, param); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("storage: commit replace agent config catalogs tx: %w", err)
	}
	return nil
}

// GetAgentConfigCatalog returns one persisted config-options snapshot.
func (s *Store) GetAgentConfigCatalog(ctx context.Context, agentID, modelID string) (AgentConfigCatalog, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT
			agent_id,
			model_id,
			config_options_json,
			updated_at
		FROM agent_config_catalogs
		WHERE agent_id = ? AND model_id = ?;
	`, agentID, modelID)

	var (
		catalog     AgentConfigCatalog
		updatedAtDB string
	)
	if err := row.Scan(
		&catalog.AgentID,
		&catalog.ModelID,
		&catalog.ConfigOptionsJSON,
		&updatedAtDB,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AgentConfigCatalog{}, ErrNotFound
		}
		return AgentConfigCatalog{}, fmt.Errorf("storage: get agent config catalog: %w", err)
	}

	updatedAt, err := parseTime(updatedAtDB)
	if err != nil {
		return AgentConfigCatalog{}, fmt.Errorf("storage: parse agent config catalog.updated_at: %w", err)
	}
	catalog.UpdatedAt = updatedAt
	return catalog, nil
}

// ListAgentConfigCatalogsByAgent returns all persisted catalogs for one agent.
func (s *Store) ListAgentConfigCatalogsByAgent(ctx context.Context, agentID string) ([]AgentConfigCatalog, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			agent_id,
			model_id,
			config_options_json,
			updated_at
		FROM agent_config_catalogs
		WHERE agent_id = ?
		ORDER BY
			CASE WHEN model_id = ? THEN 0 ELSE 1 END,
			model_id ASC;
	`, agentID, DefaultAgentConfigCatalogModelID)
	if err != nil {
		return nil, fmt.Errorf("storage: list agent config catalogs: %w", err)
	}
	defer rows.Close()

	catalogs := make([]AgentConfigCatalog, 0)
	for rows.Next() {
		var (
			catalog     AgentConfigCatalog
			updatedAtDB string
		)
		if err := rows.Scan(
			&catalog.AgentID,
			&catalog.ModelID,
			&catalog.ConfigOptionsJSON,
			&updatedAtDB,
		); err != nil {
			return nil, fmt.Errorf("storage: scan agent config catalog: %w", err)
		}

		updatedAt, err := parseTime(updatedAtDB)
		if err != nil {
			return nil, fmt.Errorf("storage: parse agent config catalog.updated_at: %w", err)
		}
		catalog.UpdatedAt = updatedAt
		catalogs = append(catalogs, catalog)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: list agent config catalogs rows: %w", err)
	}
	return catalogs, nil
}

// GetSessionTranscriptCache returns one persisted provider session transcript snapshot.
func (s *Store) GetSessionTranscriptCache(
	ctx context.Context,
	agentID, cwd, sessionID string,
) (SessionTranscriptCache, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT
			agent_id,
			cwd,
			session_id,
			messages_json,
			updated_at
		FROM session_transcript_cache
		WHERE agent_id = ? AND cwd = ? AND session_id = ?;
	`, strings.TrimSpace(agentID), strings.TrimSpace(cwd), strings.TrimSpace(sessionID))

	var (
		cache       SessionTranscriptCache
		updatedAtDB string
	)
	if err := row.Scan(
		&cache.AgentID,
		&cache.CWD,
		&cache.SessionID,
		&cache.MessagesJSON,
		&updatedAtDB,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SessionTranscriptCache{}, ErrNotFound
		}
		return SessionTranscriptCache{}, fmt.Errorf("storage: get session transcript cache: %w", err)
	}

	updatedAt, err := parseTime(updatedAtDB)
	if err != nil {
		return SessionTranscriptCache{}, fmt.Errorf("storage: parse session transcript cache.updated_at: %w", err)
	}
	cache.UpdatedAt = updatedAt
	return cache, nil
}

// UpsertSessionTranscriptCache stores one provider session transcript snapshot.
func (s *Store) UpsertSessionTranscriptCache(
	ctx context.Context,
	params UpsertSessionTranscriptCacheParams,
) error {
	if strings.TrimSpace(params.AgentID) == "" {
		return errors.New("storage: agentID is required")
	}
	if strings.TrimSpace(params.CWD) == "" {
		return errors.New("storage: cwd is required")
	}
	if strings.TrimSpace(params.SessionID) == "" {
		return errors.New("storage: sessionID is required")
	}
	if strings.TrimSpace(params.MessagesJSON) == "" {
		params.MessagesJSON = "[]"
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO session_transcript_cache (
			agent_id,
			cwd,
			session_id,
			messages_json,
			updated_at
		) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(agent_id, cwd, session_id) DO UPDATE SET
			messages_json = excluded.messages_json,
			updated_at = excluded.updated_at;
	`,
		strings.TrimSpace(params.AgentID),
		strings.TrimSpace(params.CWD),
		strings.TrimSpace(params.SessionID),
		params.MessagesJSON,
		formatTime(s.now()),
	); err != nil {
		return fmt.Errorf("storage: upsert session transcript cache: %w", err)
	}

	return nil
}

// ListThreadsByClient returns all threads for one client.
func (s *Store) ListThreadsByClient(ctx context.Context, clientID string) ([]Thread, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			thread_id,
			client_id,
			agent_id,
			cwd,
			title,
			agent_options_json,
			summary,
			created_at,
			updated_at
		FROM threads
		WHERE client_id = ?
		ORDER BY created_at DESC;
	`, clientID)
	if err != nil {
		return nil, fmt.Errorf("storage: list threads: %w", err)
	}
	defer rows.Close()

	threads := make([]Thread, 0)
	for rows.Next() {
		var (
			thread      Thread
			createdAtDB string
			updatedAtDB string
		)
		if err := rows.Scan(
			&thread.ThreadID,
			&thread.ClientID,
			&thread.AgentID,
			&thread.CWD,
			&thread.Title,
			&thread.AgentOptionsJSON,
			&thread.Summary,
			&createdAtDB,
			&updatedAtDB,
		); err != nil {
			return nil, fmt.Errorf("storage: scan thread: %w", err)
		}

		createdAt, err := parseTime(createdAtDB)
		if err != nil {
			return nil, fmt.Errorf("storage: parse thread.created_at: %w", err)
		}
		updatedAt, err := parseTime(updatedAtDB)
		if err != nil {
			return nil, fmt.Errorf("storage: parse thread.updated_at: %w", err)
		}

		thread.CreatedAt = createdAt
		thread.UpdatedAt = updatedAt
		threads = append(threads, thread)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: list threads rows: %w", err)
	}

	return threads, nil
}

// CreateTurn inserts a new turn row.
func (s *Store) CreateTurn(ctx context.Context, params CreateTurnParams) (Turn, error) {
	if strings.TrimSpace(params.TurnID) == "" {
		return Turn{}, errors.New("storage: turnID is required")
	}
	if strings.TrimSpace(params.ThreadID) == "" {
		return Turn{}, errors.New("storage: threadID is required")
	}
	if strings.TrimSpace(params.Status) == "" {
		params.Status = "running"
	}

	now := s.now().UTC()
	nowText := formatTime(now)

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO turns (
			turn_id,
			thread_id,
			request_text,
			response_text,
			is_internal,
			status,
			stop_reason,
			error_message,
			created_at,
			completed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);
	`,
		params.TurnID,
		params.ThreadID,
		params.RequestText,
		"",
		boolToSQLiteInt(params.IsInternal),
		params.Status,
		"",
		"",
		nowText,
	); err != nil {
		return Turn{}, fmt.Errorf("storage: create turn: %w", err)
	}

	return Turn{
		TurnID:       params.TurnID,
		ThreadID:     params.ThreadID,
		RequestText:  params.RequestText,
		ResponseText: "",
		IsInternal:   params.IsInternal,
		Status:       params.Status,
		StopReason:   "",
		ErrorMessage: "",
		CreatedAt:    now,
		CompletedAt:  nil,
	}, nil
}

// GetTurn returns one turn by turn_id.
func (s *Store) GetTurn(ctx context.Context, turnID string) (Turn, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT
			turn_id,
			thread_id,
			request_text,
			response_text,
			is_internal,
			status,
			stop_reason,
			error_message,
			created_at,
			completed_at
		FROM turns
		WHERE turn_id = ?;
	`, turnID)

	var (
		turn           Turn
		isInternalRaw  int
		createdAtDB    string
		completedAtRaw sql.NullString
	)
	if err := row.Scan(
		&turn.TurnID,
		&turn.ThreadID,
		&turn.RequestText,
		&turn.ResponseText,
		&isInternalRaw,
		&turn.Status,
		&turn.StopReason,
		&turn.ErrorMessage,
		&createdAtDB,
		&completedAtRaw,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Turn{}, ErrNotFound
		}
		return Turn{}, fmt.Errorf("storage: get turn: %w", err)
	}

	createdAt, err := parseTime(createdAtDB)
	if err != nil {
		return Turn{}, fmt.Errorf("storage: parse turn.created_at: %w", err)
	}
	turn.CreatedAt = createdAt
	turn.IsInternal = sqliteIntToBool(isInternalRaw)
	if completedAtRaw.Valid {
		completedAt, err := parseTime(completedAtRaw.String)
		if err != nil {
			return Turn{}, fmt.Errorf("storage: parse turn.completed_at: %w", err)
		}
		turn.CompletedAt = &completedAt
	}

	return turn, nil
}

// ListTurnsByThread returns all turns for one thread.
func (s *Store) ListTurnsByThread(ctx context.Context, threadID string) ([]Turn, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			turn_id,
			thread_id,
			request_text,
			response_text,
			is_internal,
			status,
			stop_reason,
			error_message,
			created_at,
			completed_at
		FROM turns
		WHERE thread_id = ?
		ORDER BY created_at ASC;
	`, threadID)
	if err != nil {
		return nil, fmt.Errorf("storage: list turns: %w", err)
	}
	defer rows.Close()

	turns := make([]Turn, 0)
	for rows.Next() {
		var (
			turn           Turn
			isInternalRaw  int
			createdAtDB    string
			completedAtRaw sql.NullString
		)
		if err := rows.Scan(
			&turn.TurnID,
			&turn.ThreadID,
			&turn.RequestText,
			&turn.ResponseText,
			&isInternalRaw,
			&turn.Status,
			&turn.StopReason,
			&turn.ErrorMessage,
			&createdAtDB,
			&completedAtRaw,
		); err != nil {
			return nil, fmt.Errorf("storage: scan turn: %w", err)
		}

		createdAt, err := parseTime(createdAtDB)
		if err != nil {
			return nil, fmt.Errorf("storage: parse turn.created_at: %w", err)
		}
		turn.CreatedAt = createdAt
		turn.IsInternal = sqliteIntToBool(isInternalRaw)
		if completedAtRaw.Valid {
			completedAt, err := parseTime(completedAtRaw.String)
			if err != nil {
				return nil, fmt.Errorf("storage: parse turn.completed_at: %w", err)
			}
			turn.CompletedAt = &completedAt
		}

		turns = append(turns, turn)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: list turns rows: %w", err)
	}
	return turns, nil
}

// ListEventsByTurn returns all events for one turn ordered by sequence.
func (s *Store) ListEventsByTurn(ctx context.Context, turnID string) ([]Event, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			event_id,
			turn_id,
			seq,
			type,
			data_json,
			created_at
		FROM events
		WHERE turn_id = ?
		ORDER BY seq ASC;
	`, turnID)
	if err != nil {
		return nil, fmt.Errorf("storage: list events: %w", err)
	}
	defer rows.Close()

	events := make([]Event, 0)
	for rows.Next() {
		var (
			event       Event
			createdAtDB string
		)
		if err := rows.Scan(
			&event.EventID,
			&event.TurnID,
			&event.Seq,
			&event.Type,
			&event.DataJSON,
			&createdAtDB,
		); err != nil {
			return nil, fmt.Errorf("storage: scan event: %w", err)
		}
		createdAt, err := parseTime(createdAtDB)
		if err != nil {
			return nil, fmt.Errorf("storage: parse event.created_at: %w", err)
		}
		event.CreatedAt = createdAt
		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: list events rows: %w", err)
	}
	return events, nil
}

// AppendEvent appends one turn event and computes its next contiguous seq.
func (s *Store) AppendEvent(ctx context.Context, turnID, eventType, dataJSON string) (Event, error) {
	if strings.TrimSpace(turnID) == "" {
		return Event{}, errors.New("storage: turnID is required")
	}
	if strings.TrimSpace(eventType) == "" {
		return Event{}, errors.New("storage: event type is required")
	}
	if strings.TrimSpace(dataJSON) == "" {
		dataJSON = "{}"
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Event{}, fmt.Errorf("storage: begin append event tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	var maxSeq int
	if err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(seq), 0)
		FROM events
		WHERE turn_id = ?;
	`, turnID).Scan(&maxSeq); err != nil {
		return Event{}, fmt.Errorf("storage: read max event seq: %w", err)
	}

	nextSeq := maxSeq + 1
	now := s.now().UTC()
	nowText := formatTime(now)

	result, err := tx.ExecContext(ctx, `
		INSERT INTO events (turn_id, seq, type, data_json, created_at)
		VALUES (?, ?, ?, ?, ?);
	`, turnID, nextSeq, eventType, dataJSON, nowText)
	if err != nil {
		return Event{}, fmt.Errorf("storage: append event: %w", err)
	}

	eventID, err := result.LastInsertId()
	if err != nil {
		return Event{}, fmt.Errorf("storage: read event id: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return Event{}, fmt.Errorf("storage: commit append event tx: %w", err)
	}

	return Event{
		EventID:   eventID,
		TurnID:    turnID,
		Seq:       nextSeq,
		Type:      eventType,
		DataJSON:  dataJSON,
		CreatedAt: now,
	}, nil
}

// FinalizeTurn updates terminal turn fields and sets completed_at.
func (s *Store) FinalizeTurn(ctx context.Context, params FinalizeTurnParams) error {
	if strings.TrimSpace(params.TurnID) == "" {
		return errors.New("storage: turnID is required")
	}
	if strings.TrimSpace(params.Status) == "" {
		return errors.New("storage: status is required")
	}

	result, err := s.db.ExecContext(ctx, `
		UPDATE turns
		SET
			response_text = ?,
			status = ?,
			stop_reason = ?,
			error_message = ?,
			completed_at = ?
		WHERE turn_id = ?;
	`,
		params.ResponseText,
		params.Status,
		params.StopReason,
		params.ErrorMessage,
		formatTime(s.now()),
		params.TurnID,
	)
	if err != nil {
		return fmt.Errorf("storage: finalize turn: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("storage: finalize turn rows affected: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}

func (s *Store) configure(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `PRAGMA foreign_keys = ON;`); err != nil {
		return fmt.Errorf("storage: set pragma foreign_keys: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `PRAGMA busy_timeout = 5000;`); err != nil {
		return fmt.Errorf("storage: set pragma busy_timeout: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, `PRAGMA journal_mode = WAL;`); err != nil {
		return fmt.Errorf("storage: set pragma journal_mode: %w", err)
	}
	return nil
}

func (s *Store) migrationApplied(ctx context.Context, version int) (bool, error) {
	var exists int
	err := s.db.QueryRowContext(ctx, `
		SELECT 1
		FROM schema_migrations
		WHERE version = ?;
	`, version).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("storage: query schema_migrations: %w", err)
	}
	return true, nil
}

func (s *Store) applyMigration(ctx context.Context, m migration) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("storage: begin migration %d: %w", m.version, err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	for _, stmt := range m.sql {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("storage: migration %d (%s): %w", m.version, m.name, err)
		}
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO schema_migrations (version, name, applied_at)
		VALUES (?, ?, ?);
	`, m.version, m.name, formatTime(s.now())); err != nil {
		return fmt.Errorf("storage: record migration %d: %w", m.version, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("storage: commit migration %d: %w", m.version, err)
	}
	return nil
}

func (s *Store) ensureDefaultStorageUsage(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	nowText := formatTime(s.now())
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO storage_usage (scope, used_bytes, max_bytes, updated_at)
		VALUES (?, 0, ?, ?)
		ON CONFLICT(scope) DO NOTHING;
	`, GlobalStorageUsageScope, DefaultChatAssetQuotaBytes, nowText); err != nil {
		return fmt.Errorf("storage: ensure default storage usage: %w", err)
	}
	return nil
}

func scanUpload(scanner interface{ Scan(...any) error }) (Upload, error) {
	var (
		item           Upload
		createdAtDB    string
		lastAccessedDB string
		deletedAtDB    string
	)
	if err := scanner.Scan(
		&item.UploadID,
		&item.ClientID,
		&item.ThreadID,
		&item.TurnID,
		&item.Role,
		&item.Kind,
		&item.Status,
		&item.OriginName,
		&item.StoredName,
		&item.MIMEType,
		&item.SizeBytes,
		&item.StoragePath,
		&item.ThumbnailPath,
		&item.SHA256,
		&createdAtDB,
		&lastAccessedDB,
		&deletedAtDB,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Upload{}, ErrNotFound
		}
		return Upload{}, fmt.Errorf("storage: scan upload: %w", err)
	}
	createdAt, err := parseTime(createdAtDB)
	if err != nil {
		return Upload{}, fmt.Errorf("storage: parse upload created_at: %w", err)
	}
	lastAccessedAt, err := parseTime(lastAccessedDB)
	if err != nil {
		return Upload{}, fmt.Errorf("storage: parse upload last_accessed_at: %w", err)
	}
	item.CreatedAt = createdAt
	item.LastAccessedAt = lastAccessedAt
	if strings.TrimSpace(deletedAtDB) != "" {
		deletedAt, err := parseTime(deletedAtDB)
		if err != nil {
			return Upload{}, fmt.Errorf("storage: parse upload deleted_at: %w", err)
		}
		item.DeletedAt = &deletedAt
	}
	return item, nil
}

func fileSizeIfExists(path string) (int64, error) {
	if path == "" {
		return 0, nil
	}
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, err
	}
	if info.IsDir() {
		return 0, nil
	}
	return info.Size(), nil
}

func deleteUploadFiles(item Upload) (removedBytes int64, originalExists, thumbnailExists bool, err error) {
	removeOne := func(path string) (int64, bool, error) {
		path = strings.TrimSpace(path)
		if path == "" {
			return 0, false, nil
		}
		info, statErr := os.Stat(path)
		if statErr != nil {
			if errors.Is(statErr, os.ErrNotExist) {
				return 0, false, nil
			}
			return 0, false, statErr
		}
		size := int64(0)
		if !info.IsDir() {
			size = info.Size()
		}
		if removeErr := os.Remove(path); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			return 0, false, removeErr
		}
		return size, true, nil
	}

	originalSize, originalExists, err := removeOne(item.StoragePath)
	if err != nil {
		return 0, false, false, fmt.Errorf("storage: remove upload file: %w", err)
	}
	thumbSize, thumbnailExists, err := removeOne(item.ThumbnailPath)
	if err != nil {
		return 0, originalExists, false, fmt.Errorf("storage: remove upload thumbnail: %w", err)
	}
	return originalSize + thumbSize, originalExists, thumbnailExists, nil
}

func (s *Store) deleteUploadByID(ctx context.Context, uploadID string) (DeleteUploadResult, error) {
	uploadID = strings.TrimSpace(uploadID)
	if uploadID == "" {
		return DeleteUploadResult{}, errors.New("storage: uploadID is required")
	}

	item, err := s.GetUpload(ctx, uploadID)
	if err != nil {
		return DeleteUploadResult{}, err
	}
	if item.Status == "deleted" || item.DeletedAt != nil {
		return DeleteUploadResult{}, ErrNotFound
	}

	removedBytes, originalExists, thumbnailExists, err := deleteUploadFiles(item)
	if err != nil {
		return DeleteUploadResult{}, err
	}

	now := s.now().UTC()
	nowText := formatTime(now)
	result, err := s.db.ExecContext(ctx, `
		UPDATE uploads
		SET status = 'deleted', deleted_at = ?, last_accessed_at = ?
		WHERE upload_id = ?;
	`, nowText, nowText, uploadID)
	if err != nil {
		return DeleteUploadResult{}, fmt.Errorf("storage: delete upload: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return DeleteUploadResult{}, fmt.Errorf("storage: delete upload rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return DeleteUploadResult{}, ErrNotFound
	}

	if removedBytes > 0 {
		if err := s.AddStorageUsageBytes(ctx, GlobalStorageUsageScope, -removedBytes); err != nil {
			return DeleteUploadResult{}, err
		}
	}
	item.Status = "deleted"
	item.DeletedAt = &now
	return DeleteUploadResult{
		Upload:          item,
		RemovedBytes:    removedBytes,
		OriginalExists:  originalExists,
		ThumbnailExists: thumbnailExists,
	}, nil
}

func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

func parseTime(raw string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, raw)
}

func upsertAgentConfigCatalogTx(
	ctx context.Context,
	tx *sql.Tx,
	updatedAt string,
	agentID string,
	param UpsertAgentConfigCatalogParams,
) error {
	if strings.TrimSpace(param.AgentID) == "" {
		param.AgentID = agentID
	}
	if strings.TrimSpace(param.AgentID) != agentID {
		return fmt.Errorf("storage: replace agent config catalogs mismatched agentID %q", param.AgentID)
	}
	if strings.TrimSpace(param.ModelID) == "" {
		return errors.New("storage: modelID is required")
	}
	if strings.TrimSpace(param.ConfigOptionsJSON) == "" {
		param.ConfigOptionsJSON = "[]"
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO agent_config_catalogs (
			agent_id,
			model_id,
			config_options_json,
			updated_at
		) VALUES (?, ?, ?, ?)
		ON CONFLICT(agent_id, model_id) DO UPDATE SET
			config_options_json = excluded.config_options_json,
			updated_at = excluded.updated_at;
	`,
		agentID,
		param.ModelID,
		param.ConfigOptionsJSON,
		updatedAt,
	); err != nil {
		return fmt.Errorf("storage: replace agent config catalogs upsert model %q: %w", param.ModelID, err)
	}

	return nil
}

func boolToSQLiteInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func sqliteIntToBool(v int) bool {
	return v != 0
}
