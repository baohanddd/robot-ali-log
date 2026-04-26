# Ali Log MCP Server

阿里云 SLS (日志服务) 的双模式查询工具，支持 MCP Server 模式和守护进程模式。

## 功能特性

- **MCP 模式**: 作为 MCP Server 接入 OpenCode 等客户端，按需查询日志
- **守护进程模式**: 本地长期运行，定时轮询获取 error 日志
- 支持基础查询、条件过滤和 SQL 统计分析
- 支持相对时间语法（如 `1h ago`, `30m ago`）
- 自动去重，避免重复输出

## 安装

```bash
npm install
```

## 环境变量

### 通用配置（两种模式都需要）

| 变量名 | 必填 | 说明 |
|--------|------|------|
| ALICLOUD_ACCESS_KEY_ID | 是 | 阿里云 AccessKey ID |
| ALICLOUD_ACCESS_KEY_SECRET | 是 | 阿里云 AccessKey Secret |
| ALICLOUD_REGION | 否 | 区域，默认 `cn-hangzhou` |

### MCP 模式

```bash
export RUN_MODE=mcp
npx tsx src/index.ts
```

### 守护进程模式

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| SLS_PROJECT | 是 | - | SLS 项目名 |
| SLS_LOGSTORE | 是 | - | 日志库名 |
| POLL_INTERVAL | 否 | 300 | 轮询间隔（秒） |
| ERROR_QUERY | 否 | `level: ERROR` | 查询语句 |
| DAEMON_OUTPUT | 否 | `console` | 输出方式: `console` 或 `file` |
| LOG_FILE_PATH | 否 | `./logs/error.log` | 文件输出路径 |

```bash
export RUN_MODE=daemon
export SLS_PROJECT=my-project
export SLS_LOGSTORE=my-logstore
export POLL_INTERVAL=300
npx tsx src/index.ts
```

## OpenCode 配置

```json
{
  "mcpServers": {
    "ali-log": {
      "command": "npx",
      "args": ["tsx", "/path/to/ali-log/src/index.ts"],
      "env": {
        "ALICLOUD_ACCESS_KEY_ID": "your-key-id",
        "ALICLOUD_ACCESS_KEY_SECRET": "your-key-secret",
        "RUN_MODE": "mcp"
      }
    }
  }
}
```

## MCP 工具

### query_sls_logs

查询 SLS 日志。

**参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project | string | 是 | SLS 项目名 |
| logstore | string | 是 | 日志库名 |
| query | string | 是 | 查询语句 |
| from | string | 是 | 开始时间（如 `1h ago`） |
| to | string | 是 | 结束时间（如 `now`） |
| limit | number | 否 | 返回条数限制 |

## 测试

```bash
npm test
```

## License

MIT
