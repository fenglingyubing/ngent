package storage

type migration struct {
	version int
	name    string
	sql     []string
}

var migrations = []migration{
	{
		version: 1,
		name:    "create_clients",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS clients (
				client_id TEXT PRIMARY KEY,
				created_at TEXT NOT NULL,
				last_seen_at TEXT NOT NULL
			);`,
		},
	},
	{
		version: 2,
		name:    "create_threads",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS threads (
				thread_id TEXT PRIMARY KEY,
				client_id TEXT NOT NULL,
				agent_id TEXT NOT NULL,
				cwd TEXT NOT NULL,
				title TEXT NOT NULL,
				agent_options_json TEXT NOT NULL,
				summary TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				FOREIGN KEY (client_id) REFERENCES clients(client_id)
			);`,
			`CREATE INDEX IF NOT EXISTS idx_threads_client_id ON threads(client_id);`,
		},
	},
	{
		version: 3,
		name:    "create_turns",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS turns (
				turn_id TEXT PRIMARY KEY,
				thread_id TEXT NOT NULL,
				request_text TEXT NOT NULL,
				response_text TEXT NOT NULL,
				status TEXT NOT NULL,
				stop_reason TEXT NOT NULL,
				error_message TEXT NOT NULL,
				created_at TEXT NOT NULL,
				completed_at TEXT,
				FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
			);`,
			`CREATE INDEX IF NOT EXISTS idx_turns_thread_id_created_at ON turns(thread_id, created_at);`,
		},
	},
	{
		version: 4,
		name:    "create_events",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS events (
				event_id INTEGER PRIMARY KEY AUTOINCREMENT,
				turn_id TEXT NOT NULL,
				seq INTEGER NOT NULL,
				type TEXT NOT NULL,
				data_json TEXT NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY (turn_id) REFERENCES turns(turn_id)
			);`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_turn_id_seq ON events(turn_id, seq);`,
		},
	},
	{
		version: 5,
		name:    "turns_add_is_internal",
		sql: []string{
			`ALTER TABLE turns ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0;`,
		},
	},
	{
		version: 6,
		name:    "create_agent_config_catalogs",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS agent_config_catalogs (
				agent_id TEXT NOT NULL,
				model_id TEXT NOT NULL,
				config_options_json TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (agent_id, model_id)
			);`,
			`CREATE INDEX IF NOT EXISTS idx_agent_config_catalogs_agent_id ON agent_config_catalogs(agent_id);`,
		},
	},
	{
		version: 7,
		name:    "create_session_transcript_cache",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS session_transcript_cache (
				agent_id TEXT NOT NULL,
				cwd TEXT NOT NULL,
				session_id TEXT NOT NULL,
				messages_json TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (agent_id, cwd, session_id)
			);`,
		},
	},
	{
		version: 8,
		name:    "create_agent_slash_commands",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS agent_slash_commands (
				agent_id TEXT PRIMARY KEY,
				commands_json TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);`,
		},
	},
	{
		version: 9,
		name:    "create_uploads",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS uploads (
				upload_id TEXT PRIMARY KEY,
				client_id TEXT NOT NULL,
				thread_id TEXT NOT NULL DEFAULT '',
				turn_id TEXT NOT NULL DEFAULT '',
				role TEXT NOT NULL,
				kind TEXT NOT NULL,
				status TEXT NOT NULL,
				origin_name TEXT NOT NULL,
				stored_name TEXT NOT NULL,
				mime_type TEXT NOT NULL,
				size_bytes INTEGER NOT NULL,
				storage_path TEXT NOT NULL,
				thumbnail_path TEXT NOT NULL DEFAULT '',
				sha256 TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL,
				last_accessed_at TEXT NOT NULL,
				deleted_at TEXT NOT NULL DEFAULT ''
			);`,
			`CREATE INDEX IF NOT EXISTS idx_uploads_client_status_created_at ON uploads(client_id, status, created_at);`,
			`CREATE INDEX IF NOT EXISTS idx_uploads_thread_created_at ON uploads(thread_id, created_at);`,
			`CREATE INDEX IF NOT EXISTS idx_uploads_turn_id ON uploads(turn_id);`,
		},
	},
	{
		version: 10,
		name:    "create_storage_usage",
		sql: []string{
			`CREATE TABLE IF NOT EXISTS storage_usage (
				scope TEXT PRIMARY KEY,
				used_bytes INTEGER NOT NULL,
				max_bytes INTEGER NOT NULL,
				updated_at TEXT NOT NULL
			);`,
		},
	},
}
