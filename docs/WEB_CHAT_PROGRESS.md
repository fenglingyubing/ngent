# WEB CHAT PROGRESS

## 规则

本文件是网页端聊天改造项目的统一进度记录。

后续每次完成一个任务后，必须立即追加一条进度记录，至少包含：

- 完成时间
- 完成任务名称
- 任务文档位置
- 完成内容简述
- 下一步应执行的任务

如果某次执行没有完成任务，也应在需要时记录阻塞项，但“完成记录”必须只写已经真正完成的事项。

时间格式统一使用：

- `YYYY-MM-DD HH:mm:ss Z`

示例：

```text
- 完成时间：2026-03-17 19:45:00 HKT
  完成任务：A0 数据与目录基础 - 建立资产目录规则文档
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：补充资产目录、表结构、配额口径说明。
  下一步任务：A0 数据与目录基础 - 实现数据库迁移
```

## 当前进度

- 完成时间：2026-03-17 19:38:00 HKT
  完成任务：网页端聊天改造方案文档
  任务文档：[WEB_CHAT_REFACTOR_PLAN.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_REFACTOR_PLAN.md)
  完成内容：新增 `docs/WEB_CHAT_REFACTOR_PLAN.md`，明确网页端聊天产品目标、界面结构、后端复用与分阶段改造方案。
  下一步任务：编写附件与 `5GB` 配额规格文档

- 完成时间：2026-03-17 19:41:00 HKT
  完成任务：附件与 `5GB` 配额规格文档
  任务文档：[WEB_CHAT_ASSETS_SPEC.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_SPEC.md)
  完成内容：新增 `docs/WEB_CHAT_ASSETS_SPEC.md`，定义聊天资产口径、上传/粘贴图片、附件 API、配额和自动清理规则。
  下一步任务：编写附件能力任务拆分文档

- 完成时间：2026-03-17 19:43:00 HKT
  完成任务：附件能力任务拆分文档
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：新增 `docs/WEB_CHAT_ASSETS_TASKS.md`，拆分 A0-A7 里程碑、验收标准和测试建议。
  下一步任务：建立统一进度文档并将回写规则写入任务文档

- 完成时间：2026-03-17 19:45:00 HKT
  完成任务：统一进度文档与任务回写规则
  任务文档：[WEB_CHAT_PROGRESS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_PROGRESS.md)
  完成内容：新增 `docs/WEB_CHAT_PROGRESS.md`，并在 `docs/WEB_CHAT_ASSETS_TASKS.md` 中写入“每完成任务后必须回写进度文档”的执行规则。
  下一步任务：A0 数据与目录基础 - 建立资产目录与数据库迁移

- 完成时间：2026-03-17 19:50:00 HKT
  完成任务：A0 数据与目录基础
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：完成资产目录初始化、`uploads`/`storage_usage` 数据库迁移、默认 `5GB` 配额初始化，以及 storage 层基础 upload/storage usage 读写；`go test ./internal/storage -count=1` 已通过。
  下一步任务：A1 上传接口 - 实现 `POST /v1/uploads`

- 完成时间：2026-03-17 19:56:00 HKT
  完成任务：A1 上传接口
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：实现 `POST /v1/uploads`，支持 `multipart/form-data` 多文件上传、文件落盘、基础 MIME 白名单、单文件/总请求大小限制、上传元数据入库以及 `storage_usage` 统计增长；新增 `httpapi` 上传测试并通过 `go test ./internal/httpapi ./internal/storage -count=1`。
  下一步任务：A2 前端待发送附件 - 上传、拖拽、粘贴图片、发送前预览

- 完成时间：2026-03-17 20:02:00 HKT
  完成任务：A2 前端待发送附件
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：前端聊天输入区已接入上传按钮、拖拽上传、粘贴图片、待发送附件预览和移除操作；新增上传 API 封装与附件样式，`cd internal/webui/web && npm run build` 已通过。当前仅完成发送前管理与预览，附件随 turn 绑定将在 A3 完成。
  下一步任务：A3 Turn 绑定附件 - 发消息携带附件、历史消息展示附件

- 完成时间：2026-03-17 20:20:25 HKT
  完成任务：A3 Turn 绑定附件
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：`POST /v1/threads/{threadId}/turns` 已支持 `attachments`，实现上传附件归属/状态校验与 turn 原子绑定，历史接口返回附件摘要；前端发送消息已携带附件并支持仅附件消息，历史消息区可区分图片/文件卡片展示。验证通过 `cd internal/webui/web && npm run build` 与 `PATH=/usr/local/go/bin:$PATH /usr/local/go/bin/go test ./... -count=1`。
  下一步任务：A4 下载与缩略图 - 实现附件下载接口、图片缩略图与消息内预览

- 完成时间：2026-03-17 20:39:41 HKT
  完成任务：A4 下载与缩略图
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：实现 `GET /v1/attachments/{uploadId}` 与 `GET /v1/attachments/{uploadId}/thumbnail`，上传图片时生成并持久化 PNG 缩略图，下载接口加入安全 `Content-Disposition` 与 client 隔离；前端消息附件卡片已支持图片缩略图、点击放大预览和普通文件下载。验证通过 `cd internal/webui/web && npm run build` 与 `PATH=/usr/local/go/bin:$PATH /usr/local/go/bin/go test ./... -count=1`。
  下一步任务：A5 配额统计 - 实现 `GET /v1/storage`、容量统计与前端展示

- 完成时间：2026-03-17 20:49:11 HKT
  完成任务：A5 配额统计
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：实现 `GET /v1/storage`，返回 `usedBytes`/`maxBytes`/`usagePercent`/`policy`；服务启动时会扫描实际上传文件与缩略图并修正 `storage_usage`，上传与删除会同步维护占用；补充 `DELETE /v1/uploads/{uploadId}` 以验证删除后容量回落；前端聊天头部新增存储使用量提示，并在超过 `80%` / `95%` 时切换提醒状态。验证通过 `cd internal/webui/web && npm run build` 与 `/usr/local/go/bin/go test ./... -count=1`。
  下一步任务：A6 自动清理 - 超过 `5GB` 后按最旧资产自动删除

- 完成时间：2026-03-17 20:57:33 HKT
  完成任务：A6 自动清理
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：实现按 `created_at ASC` 的最旧优先清理能力，支持上传前预检查、上传后复核、服务启动时超限清理和周期性清理；清理时会同步删除原文件与缩略图、将 `uploads.status` 置为 `deleted`、回写 `storage_usage.used_bytes`，并通过结构化日志记录 `storage.quota_deleted`；当没有可清理资产仍无法释放足够空间时，上传接口返回 `409 QUOTA_EXCEEDED`。验证通过 `cd internal/webui/web && npm run build` 与 `/usr/local/go/bin/go test ./... -count=1`。
  下一步任务：A7 收尾与测试 - 补全文档、日志与异常场景校验

- 完成时间：2026-03-17 21:07:17 HKT
  完成任务：A7 收尾与测试
  任务文档：[WEB_CHAT_ASSETS_TASKS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_ASSETS_TASKS.md)
  完成内容：补充 `docs/API.md` 与 `docs/DB.md` 中的上传、附件下载/缩略图、存储配额与历史附件摘要文档；新增上传成功/拒绝/删除结构化日志 `storage.upload_stored`、`storage.upload_rejected`、`storage.upload_deleted`，并补充 HTTP API 日志断言测试与配额清理日志测试；完成前端构建验证和全量 `go test ./...` 回归，确保上传、下载、清理链路有文档和日志可追踪。
  下一步任务：网页端聊天附件与配额阶段已收尾，可根据新需求进入后续产品迭代

- 完成时间：2026-03-17 21:29:45 HKT
  完成任务：图片附件 OCR 注入修复
  任务文档：[WEB_CHAT_PROGRESS.md](/home/ubuntu/project/ngent/docs/WEB_CHAT_PROGRESS.md)
  完成内容：修复图片附件仅有元数据、模型无法读取图片文本的问题；在 turn prompt 注入阶段新增图片 OCR 文本抽取，优先使用本机 `tesseract` 的 `chi_sim+eng`，失败时回退到 `eng`；文本/JSON 附件继续注入内容片段，图片附件在 OCR 可用时注入识别文本；服务器已安装 `tesseract-ocr` 与 `tesseract-ocr-chi-sim` 并完成服务重启。
  下一步任务：如需进一步提升图片理解能力，可继续实现原生多模态输入或更强的版面/OCR 解析
