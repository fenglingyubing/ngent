# Ngent

[![CI](https://github.com/beyond5959/ngent/actions/workflows/ci.yml/badge.svg)](https://github.com/beyond5959/ngent/actions/workflows/ci.yml)
[![Go Version](https://img.shields.io/github/go-mod/go-version/beyond5959/ngent)](https://go.dev/)
[![License](https://img.shields.io/github/license/beyond5959/ngent)](LICENSE)

> **面向 ACP 兼容 Agent 的 Web 服务封装器**
>
> Ngent 将支持 [Agent Client Protocol (ACP)](https://github.com/beyond5959/acp-adapter) 的命令行 Agent 封装为 Web 服务，使其能够通过 HTTP API 和 Web UI 访问。

## 什么是 Ngent？

Ngent 充当 **兼容 ACP 的 Agent**（如 Claude Code、Codex、Gemini CLI、Kimi CLI）与 **Web 客户端** 之间的桥梁：

```
┌─────────────┐     HTTP/WebSocket     ┌─────────┐     JSON-RPC (ACP)     ┌──────────────┐
│   Web UI    │ ◄────────────────────► │  Ngent  │ ◄────────────────────► │  CLI Agent   │
│   /v1/* API │   SSE streaming        │ Server  │   stdio                │ （基于 ACP） │
└─────────────┘                        └─────────┘                        └──────────────┘
```

### 工作原理

1. **ACP 协议**：Claude Code、Codex、Kimi CLI 等 Agent 通过 Agent Client Protocol（ACP）暴露能力 —— 这是一种基于 stdio 的 JSON-RPC 协议。
2. **Ngent 桥接层**：Ngent 以子进程方式启动这些 CLI Agent，并将其 ACP 协议转换为 HTTP/JSON API。
3. **Web 界面**：内置 Web UI 和 REST API，可用于创建会话、发送提示词以及管理权限。

### 特性

- 🔌 **多 Agent 支持**：适配任意兼容 ACP 的 Agent（Codex、Claude Code、Gemini、Kimi、Qwen、OpenCode）
- 🌐 **Web API**：提供 HTTP/JSON 接口，并通过 Server-Sent Events（SSE）流式返回响应
- 🖥️ **内置界面**：无需单独部署前端，Web UI 已嵌入二进制文件
- 🔒 **权限控制**：对 Agent 的文件/系统操作提供细粒度审批机制
- 💾 **持久化状态**：基于 SQLite 保存跨会话的对话历史
- 📱 **移动端友好**：支持二维码，方便同一局域网内的手机访问

## 支持的 Agent

| Agent | 是否支持 |
|---|---|
| Codex | ✅ |
| Claude Code | ✅ |
| Gemini CLI | ✅ |
| Kimi CLI | ✅ |
| Qwen Code | ✅ |
| OpenCode | ✅ |

## 安装

### 快速安装（推荐 Linux/macOS）

```bash
curl -sSL https://raw.githubusercontent.com/beyond5959/ngent/master/install.sh | bash

# 或安装到自定义目录：
curl -sSL https://raw.githubusercontent.com/beyond5959/ngent/master/install.sh | INSTALL_DIR=~/.local/bin bash
```

## 运行

使用默认配置启动（仅本机访问）：

```bash
ngent
```

局域网可访问模式（允许其他设备连接）：

```bash
ngent --allow-public=true
```

自定义端口：

```bash
ngent --port 8080
```

启用认证：

```bash
ngent --auth-token "your-token"
```

查看全部选项：

```bash
ngent --help
```

**默认路径：**
- 数据库：`$HOME/.ngent/ngent.db`

说明：

- 所有 `/v1/*` 请求都必须包含 `X-Client-ID`。

## 快速检查

```bash
curl -s http://127.0.0.1:8686/healthz
curl -s -H "X-Client-ID: demo" http://127.0.0.1:8686/v1/agents
```

## Web UI

打开启动输出中显示的 URL（例如：`http://127.0.0.1:8686/`）。
