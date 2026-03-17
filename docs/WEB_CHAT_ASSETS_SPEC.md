# WEB CHAT ASSETS SPEC

## 1. 目标

定义网页端聊天产品中的“附件资产”能力，包括：

- 文件上传
- 图片粘贴
- 消息附件展示
- 聊天资产存储
- `5GB` 总配额控制
- 超限后的自动清理规则

本规范只约束“聊天产生的资产”，不约束整个服务节点的所有磁盘数据。

## 2. 范围定义

### 2.1 什么算聊天资产

以下内容计入 `5GB`：

- 用户上传的原始文件
- 用户粘贴图片后落盘的图片文件
- 为图片生成的缩略图
- 模型在聊天过程中生成并持久化到资产目录的文件
- 与消息或 turn 绑定的导出文件、中间产物

### 2.2 什么不算聊天资产

以下内容默认不计入 `5GB`：

- SQLite 数据库文件
- WAL / SHM 文件
- 应用日志
- 可重建缓存
- 项目源码目录
- 程序二进制、依赖、系统文件

### 2.3 配额单位

- 单位：字节
- 总配额固定为：`5 * 1024 * 1024 * 1024 = 5368709120 bytes`

## 3. 用户场景

### 3.1 上传文件

用户在聊天输入区点击上传按钮或拖拽文件，文件进入“待发送附件”列表。

用户可：

- 继续输入文本
- 删除某个待发送附件
- 与文本一起发送

### 3.2 粘贴图片

用户在输入框中按 `Ctrl+V` / `Cmd+V` 粘贴截图或图片。

前端行为：

- 检测剪贴板内图片 Blob
- 本地预览
- 作为待发送附件加入
- 发送前允许移除

### 3.3 附件消息

发送成功后，附件与该条用户消息绑定。

消息展示要求：

- 图片显示缩略图
- 文件显示文件名、大小、类型
- 支持下载
- 附件删除后应在 UI 中体现不可用状态

## 4. 前端行为规范

### 4.1 输入区

聊天输入区必须支持：

- 点击上传
- 拖拽上传
- 粘贴图片

### 4.2 待发送附件区

每个附件至少显示：

- 文件名
- 文件大小
- 类型图标
- 移除按钮

图片还应显示：

- 缩略图预览

### 4.3 发送约束

前端发送前应校验：

- 单文件大小不超过服务端限制
- 单次消息附件总大小不超过服务端限制
- 文件数量不超过服务端限制

若超限，前端应直接阻止发送并给出明确错误提示。

### 4.4 存储提示

前端可调用存储状态接口展示容量使用情况：

- `>80%`：黄色提醒
- `>95%`：红色提醒
- 发生自动清理后：显示系统通知消息

## 5. 服务端存储设计

### 5.1 资产目录

默认目录：

- `$HOME/.ngent/assets`

建议结构：

```text
$HOME/.ngent/assets/
  threads/
    th_xxx/
      2026/
        03/
          17/
            at_xxx.bin
            at_xxx.thumb.webp
```

要求：

- 服务端生成真实存储名，不直接信任用户上传文件名
- 元数据中保留原始文件名用于展示
- 删除时必须同时删除磁盘文件和数据库记录

### 5.2 文件命名

建议使用：

- `attachment_id + 扩展名`

例如：

- `at_1773abc.png`
- `at_1773abc.thumb.webp`

### 5.3 MIME 与扩展名

服务端必须：

- 校验客户端传入 MIME
- 重新探测文件头判断真实类型
- 存储最终确认后的 MIME 类型

## 6. 数据模型

### 6.1 `uploads`

表示已上传、待绑定或已绑定的资产。

字段建议：

- `upload_id TEXT PRIMARY KEY`
- `client_id TEXT NOT NULL`
- `thread_id TEXT NOT NULL DEFAULT ''`
- `turn_id TEXT NOT NULL DEFAULT ''`
- `role TEXT NOT NULL`
  - `user|assistant`
- `kind TEXT NOT NULL`
  - `file|image`
- `status TEXT NOT NULL`
  - `uploaded|attached|deleted`
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

索引建议：

- `idx_uploads_client_status_created_at`
- `idx_uploads_thread_created_at`
- `idx_uploads_turn_id`

### 6.2 `storage_usage`

记录全局配额状态。

字段建议：

- `scope TEXT PRIMARY KEY`
- `used_bytes INTEGER NOT NULL`
- `max_bytes INTEGER NOT NULL`
- `updated_at TEXT NOT NULL`

初始值：

- `scope = 'global'`
- `max_bytes = 5368709120`

### 6.3 `upload_events`

可选，用于审计和问题排查。

字段建议：

- `event_id INTEGER PRIMARY KEY AUTOINCREMENT`
- `upload_id TEXT NOT NULL`
- `action TEXT NOT NULL`
  - `created|attached|accessed|deleted|quota_deleted`
- `details_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`

## 7. API 规范

### 7.1 `POST /v1/uploads`

用途：

- 上传文件
- 上传粘贴图片

请求：

- `multipart/form-data`

字段：

- `files[]`
- 可选 `threadId`

响应 `200`：

```json
{
  "uploads": [
    {
      "uploadId": "up_123",
      "name": "design.png",
      "kind": "image",
      "mimeType": "image/png",
      "sizeBytes": 123456,
      "thumbnailUrl": "/v1/attachments/up_123/thumbnail"
    }
  ]
}
```

失败场景：

- 文件过大：`413`
- 配额无法释放足够空间：`409 CONFLICT`
- 类型不支持：`400 INVALID_ARGUMENT`

### 7.2 `POST /v1/threads/{threadId}/turns`

在原请求体基础上扩展：

```json
{
  "input": "请分析这些文件",
  "stream": true,
  "attachments": ["up_123", "up_456"]
}
```

行为：

- 校验附件属于当前 `X-Client-ID`
- 校验附件未删除
- 将附件绑定到本次 turn
- 在事件流中允许返回附件元数据

### 7.3 `GET /v1/attachments/{uploadId}`

用途：

- 下载原始文件

要求：

- 仅允许附件拥有者访问
- `deleted` 状态返回 `404`

### 7.4 `GET /v1/attachments/{uploadId}/thumbnail`

用途：

- 获取图片缩略图

若无缩略图：

- 可返回 `404`
- 或回退原图，二选一，建议优先 `404`

### 7.5 `GET /v1/storage`

响应：

```json
{
  "scope": "global",
  "maxBytes": 5368709120,
  "usedBytes": 2147483648,
  "usagePercent": 40,
  "policy": "delete_oldest_chat_assets_first"
}
```

### 7.6 `DELETE /v1/uploads/{uploadId}`

用途：

- 删除尚未发送的上传项
- 或允许用户主动删除自己的历史附件

行为：

- 软删除记录
- 删除磁盘文件
- 更新配额统计

## 8. Turn 与消息绑定规则

### 8.1 用户消息附件

用户发送消息时带上的附件：

- `role = user`
- `thread_id` 必须存在
- `turn_id` 绑定到对应 turn

### 8.2 助手生成附件

如果后续支持模型生成文件：

- `role = assistant`
- 必须关联到输出该文件的 turn
- 同样纳入 `5GB` 配额

### 8.3 消息展示数据

历史接口建议在 turn 返回里包含附件摘要：

```json
{
  "attachments": [
    {
      "uploadId": "up_123",
      "name": "design.png",
      "kind": "image",
      "mimeType": "image/png",
      "sizeBytes": 123456,
      "deleted": false
    }
  ]
}
```

## 9. 配额控制规范

### 9.1 触发时机

以下场景必须检查配额：

- 上传前预检查
- 上传成功后复核
- 助手生成文件前后
- 服务启动扫描
- 定时巡检

### 9.2 清理策略

默认策略：

- `delete_oldest_chat_assets_first`

即：

1. 找到最早的未删除聊天资产
2. 按 `created_at ASC` 排序
3. 删除到低于配额为止

### 9.3 删除顺序

建议顺序：

1. 删除最旧附件文件及其缩略图
2. 将对应附件记录标为 `deleted`
3. 如果某 turn 的附件全被清空，不强制删除 turn 文本
4. 如果后续需要更强回收，再增加“删整会话”的二级策略

### 9.4 最小删除单元

最小删除单元建议是“单个附件资产”：

- 原始文件
- 缩略图
- 附件记录状态

原因：

- 更符合“聊天资产”定义
- 比直接删整个会话更温和
- 实现复杂度也更低

### 9.5 无法释放空间时

若已无可删除资产，仍无法满足写入：

- 上传接口返回 `409 CONFLICT`
- 错误码建议：`QUOTA_EXCEEDED`

示例：

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "chat asset storage quota exceeded"
  }
}
```

## 10. 清理任务

### 10.1 启动扫描

服务启动时：

1. 扫描 `uploads` 表中未删除记录
2. 核对实际文件大小
3. 修正 `storage_usage.used_bytes`
4. 如超限，启动一次清理

### 10.2 周期巡检

建议每 `5` 分钟执行一次：

- 核对配额
- 删除孤儿文件
- 修正统计误差

### 10.3 孤儿文件处理

孤儿文件定义：

- 磁盘上存在，但数据库不存在
- 数据库标记删除，但文件仍存在

巡检任务应：

- 记录日志
- 删除孤儿文件

## 11. 限制建议

默认建议值：

- 单文件最大：`50MB`
- 单次消息附件总和：`200MB`
- 单次消息最多附件数：`10`
- 图片缩略图最长边：`1024px`

这些值建议做成可配置项。

## 12. 安全要求

### 12.1 文件类型

必须做：

- MIME 白名单
- 文件头探测
- 扩展名与 MIME 对照

### 12.2 图片处理

建议：

- 生成缩略图
- 可选去除 EXIF

### 12.3 下载安全

下载接口必须：

- 设置 `Content-Disposition`
- 避免浏览器把危险文件作为可执行内容直接运行

### 12.4 权限隔离

所有附件接口都必须受 `X-Client-ID` 约束：

- 只能访问自己的资产
- 不允许跨 client 下载

## 13. 观察性

建议新增这些日志事件：

- `upload.created`
- `upload.attached`
- `upload.deleted`
- `storage.quota_checked`
- `storage.quota_cleanup_started`
- `storage.quota_cleanup_deleted`
- `storage.quota_cleanup_completed`

关键字段：

- `uploadId`
- `threadId`
- `turnId`
- `sizeBytes`
- `usedBytes`
- `deletedBytes`

## 14. 验收标准

- 用户可以上传文件并参与对话
- 用户可以直接粘贴图片并参与对话
- 附件在消息流中可见
- 附件可以下载
- 聊天资产总空间超过 `5GB` 后，系统自动删除最旧资产
- 删除后 `GET /v1/storage` 的 `usedBytes` 正确下降
- 被清理的附件再次访问返回 `404`

## 15. 推荐实现顺序

1. 建表与资产目录
2. `POST /v1/uploads`
3. 前端待发送附件区
4. turn 绑定附件
5. 历史消息返回附件摘要
6. `GET /v1/storage`
7. 配额清理器
8. 下载与缩略图接口

