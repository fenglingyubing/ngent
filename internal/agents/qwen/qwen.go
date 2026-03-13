package qwen

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"time"

	"github.com/beyond5959/ngent/internal/agents"
	"github.com/beyond5959/ngent/internal/agents/acpcli"
	"github.com/beyond5959/ngent/internal/agents/acpstdio"
	"github.com/beyond5959/ngent/internal/agents/agentutil"
)

const defaultPermissionTimeout = 15 * time.Second

// Config configures the Qwen CLI ACP stdio provider.
type Config = agentutil.Config

// Client runs one qwen --acp process per ACP operation.
type Client struct {
	*acpcli.Client
}

var _ agents.Streamer = (*Client)(nil)
var _ agents.ConfigOptionManager = (*Client)(nil)
var _ agents.SessionLister = (*Client)(nil)
var _ agents.SessionTranscriptLoader = (*Client)(nil)
var _ agents.SlashCommandsProvider = (*Client)(nil)

// New constructs a Qwen ACP client.
func New(cfg Config) (*Client, error) {
	base, err := acpcli.New("qwen", cfg, acpcli.Hooks{
		OpenConn:                openConn(cfg.Dir),
		SessionNewParams:        sessionNewParams(cfg.Dir),
		SessionLoadParams:       sessionLoadParams(cfg.Dir),
		SessionListParams:       sessionListParams(cfg.Dir),
		PromptParams:            promptParams,
		DiscoverModelsParams:    discoverModelsParams(cfg.Dir),
		HandlePermissionRequest: handlePermissionRequest,
		Cancel:                  cancelWithNotify,
	})
	if err != nil {
		return nil, err
	}
	return &Client{Client: base}, nil
}

// Preflight checks that the qwen binary is available in PATH.
func Preflight() error {
	return agentutil.PreflightBinary("qwen")
}

func openConn(dir string) func(context.Context, acpcli.OpenConnRequest) (*acpstdio.Conn, func(), json.RawMessage, error) {
	return func(
		ctx context.Context,
		req acpcli.OpenConnRequest,
	) (*acpstdio.Conn, func(), json.RawMessage, error) {
		conn, cleanup, initResult, err := acpcli.OpenProcess(ctx, acpcli.ProcessConfig{
			Command: "qwen",
			Args:    []string{"--acp"},
			Dir:     strings.TrimSpace(dir),
			Env:     os.Environ(),
			ConnOptions: acpstdio.ConnOptions{
				Prefix: "qwen",
			},
			InitializeParams: initializeParams(),
		})
		if err != nil {
			return nil, nil, nil, acpcli.WrapOpenError("qwen", req.Purpose, err)
		}
		return conn, cleanup, initResult, nil
	}
}

func initializeParams() map[string]any {
	return map[string]any{
		"protocolVersion": 1,
		"clientCapabilities": map[string]any{
			"fs": map[string]any{
				"readTextFile":  false,
				"writeTextFile": false,
			},
		},
	}
}

func sessionNewParams(dir string) func(string) map[string]any {
	return func(modelID string) map[string]any {
		params := map[string]any{
			"cwd":        strings.TrimSpace(dir),
			"mcpServers": []any{},
		}
		modelID = strings.TrimSpace(modelID)
		if modelID != "" {
			params["model"] = modelID
			params["modelId"] = modelID
		}
		return params
	}
}

func discoverModelsParams(dir string) func(string) map[string]any {
	return func(string) map[string]any {
		return map[string]any{
			"cwd":        strings.TrimSpace(dir),
			"mcpServers": []any{},
		}
	}
}

func sessionLoadParams(dir string) func(string) map[string]any {
	return func(sessionID string) map[string]any {
		return map[string]any{
			"sessionId":  strings.TrimSpace(sessionID),
			"cwd":        strings.TrimSpace(dir),
			"mcpServers": []any{},
		}
	}
}

func sessionListParams(dir string) func(string, string) map[string]any {
	return func(cwd, cursor string) map[string]any {
		params := map[string]any{
			"cwd":        sessionCWD(dir, cwd),
			"mcpServers": []any{},
		}
		if cursor = strings.TrimSpace(cursor); cursor != "" {
			params["cursor"] = cursor
		}
		return params
	}
}

func promptParams(sessionID, input, modelID string) map[string]any {
	params := map[string]any{
		"sessionId": strings.TrimSpace(sessionID),
		"prompt":    []map[string]any{{"type": "text", "text": input}},
	}
	if modelID = strings.TrimSpace(modelID); modelID != "" {
		params["model"] = modelID
	}
	return params
}

func cancelWithNotify(conn *acpstdio.Conn, sessionID string) {
	if conn == nil {
		return
	}
	conn.Notify("session/cancel", map[string]any{"sessionId": strings.TrimSpace(sessionID)})
}

func handlePermissionRequest(
	ctx context.Context,
	params json.RawMessage,
	handler agents.PermissionHandler,
	hasHandler bool,
) (json.RawMessage, error) {
	var req struct {
		SessionID string                    `json:"sessionId"`
		ToolCall  map[string]string         `json:"toolCall"`
		Options   []acpcli.PermissionOption `json:"options"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return buildDeclinedPermissionResponse(req.Options)
	}
	if !hasHandler {
		return buildDeclinedPermissionResponse(req.Options)
	}

	permCtx, cancel := context.WithTimeout(ctx, defaultPermissionTimeout)
	defer cancel()

	resp, err := handler(permCtx, agents.PermissionRequest{
		Approval: strings.TrimSpace(req.ToolCall["title"]),
		Command:  strings.TrimSpace(req.ToolCall["kind"]),
		RawParams: map[string]any{
			"sessionId": strings.TrimSpace(req.SessionID),
		},
	})
	if err != nil {
		return buildDeclinedPermissionResponse(req.Options)
	}

	switch resp.Outcome {
	case agents.PermissionOutcomeApproved:
		return buildApprovedPermissionResponse(req.Options)
	case agents.PermissionOutcomeCancelled:
		return acpcli.BuildCancelledPermissionResponse()
	default:
		return buildDeclinedPermissionResponse(req.Options)
	}
}

func buildApprovedPermissionResponse(options []acpcli.PermissionOption) (json.RawMessage, error) {
	optionID := acpcli.PickPermissionOptionID(options, "allow_once", "allow_always")
	if optionID == "" {
		return buildDeclinedPermissionResponse(options)
	}
	return acpcli.BuildSelectedPermissionResponse(optionID)
}

func buildDeclinedPermissionResponse(options []acpcli.PermissionOption) (json.RawMessage, error) {
	optionID := acpcli.PickPermissionOptionID(options, "reject_once", "reject_always")
	if optionID == "" {
		return acpcli.BuildCancelledPermissionResponse()
	}
	return acpcli.BuildSelectedPermissionResponse(optionID)
}

func sessionCWD(dir, cwd string) string {
	cwd = strings.TrimSpace(cwd)
	if cwd != "" {
		return cwd
	}
	return strings.TrimSpace(dir)
}

// Name returns the provider identifier.
func (c *Client) Name() string {
	if c == nil || c.Client == nil {
		return "qwen"
	}
	return c.Client.Name()
}
