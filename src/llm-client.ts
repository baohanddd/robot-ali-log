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
  from: string;
  to: string;
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

    const prompt = `将以下自然语言转换为阿里云 SLS 日志查询参数：
"${description}"

请返回严格 JSON 格式（不要包含 markdown 代码块标记）：
{
  "query": "SLS查询语句",
  "from": "相对时间如 7d ago",
  "to": "now 或相对时间"
}

规则：
- query 使用 SLS 查询语法（非 SQL）
- 时间格式支持：Nd ago, Nh ago, Nm ago
- 如果查询 ERROR/WARN 等日志级别，使用 level="ERROR" 格式
- 只返回 JSON，不要其他解释`;

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
