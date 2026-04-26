import OpenAI from 'openai';

export interface LLMConfig {
  enabled: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
  timeout?: number;
}

export function getLLMConfig(): LLMConfig | null {
  if (process.env.ENABLE_LLM_QUERY !== 'true') return null;

  return {
    enabled: true,
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.LLM_MODEL || 'qwen-plus',
    timeout: 10000,
  };
}

interface LLMQueryResult {
  query: string;
  from: number | string;
  to: number | string;
}

export async function callLLM(
  description: string,
  config: LLMConfig
): Promise<LLMQueryResult | null> {
  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout || 10000,
    });

    const now = Math.floor(Date.now() / 1000);
    const prompt = `将以下自然语言转换为阿里云 SLS 日志查询参数：
"${description}"

请返回严格 JSON 格式（不要包含 markdown 代码块标记）：
{
  "query": "SLS查询语句",
  "from": 开始时间的Unix时间戳或"now",
  "to": 结束时间的Unix时间戳或"now"
}

**当前时间基准：**
- 当前 Unix 时间戳：${now}
- 当前日期（UTC）：2026-04-26
- 所有时间戳必须使用 UTC 时区

**时间格式规则：**
请优先直接返回 Unix 时间戳（秒级整数）：
- 直接返回数字形式的 Unix 时间戳（如 1776996000）- 这是首选方式
- 或用 "now" 表示当前时间
- 不要用时间字符串（如 "昨天10点"），请计算成 Unix 时间戳

**计算帮助：**
- 今天 = 2026-04-26 (周日)
- 昨天 = 2026-04-25 (周六) 
- 前天 = 2026-04-24 (周五) - Unix: 1776969600 ~ 1777055999
- UTC 时间 = 北京时间 - 8小时
- 前天上午10点(北京时间) = 前天凌晨2点(UTC) = 1776996000
- 前天上午12点(北京时间) = 前天凌晨4点(UTC) = 1777003200

**查询语法规则：**
- query 使用 SLS 查询语法（非 SQL）
- 日志级别查询：必须使用 level="LEVEL_NAME" 格式（精确匹配）
- 可用的日志级别（严格区分大小写）：ERROR、INFO、WARNING、NOTICE、DEBUG
- 关键词查询：直接写关键词，多个关键词用 AND/OR 连接
- message 和 context 字段支持全文搜索，直接写关键词即可（如 timeout、/tickets、moderation results）
- 注意：不要用 message:"xxx" 或 context:"xxx" 语法，直接写关键词
- 支持通配符：* 和 ?

**可用字段及含义：**
- channel: 模块/渠道，只有两种：api（接口请求）、worker（后台任务）
- level: 日志级别（ERROR/INFO/WARNING/NOTICE/DEBUG）
- message: 日志消息内容（如 "fails to add reminder"）
- context: JSON 格式的上下文信息，包含：
  - method: HTTP 方法（GET/POST）
  - uri: 请求路径（如 /tickets）
  - server_name: 服务名（如 fu-api）
  - request_id: 请求 ID
  - request_ip: 请求 IP
  - ticket_id: 工单 ID
- __source__: 来源 IP 地址（如 172.17.0.2）

**示例：**
{"query": "level=\"ERROR\" AND message:\"timeout\"", "from": 1776604800, "to": "now"}
{"query": "channel:api AND uri:\"/tickets\"", "from": 1776996000, "to": 1777003200}
{"query": "request_id:\"xxx\"", "from": 1777200000, "to": "now"}
{"query": "*", "from": 1714000000, "to": 1714608000}
{"query": "level=\"ERROR\"", "from": 1777084200, "to": 1777093500}
{"query": "login failed", "from": 1777170600, "to": 1777178700}

只返回 JSON，不要其他解释`;

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]) as LLMQueryResult;
    return result;
  } catch (error) {
    console.error('LLM call failed:', error);
    return null;
  }
}
