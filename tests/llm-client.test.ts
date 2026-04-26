import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getLLMConfig } from '../src/llm-client';

describe('getLLMConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null when ENABLE_LLM_QUERY is not set', () => {
    delete process.env.ENABLE_LLM_QUERY;
    expect(getLLMConfig()).toBeNull();
  });

  it('should return config when ENABLE_LLM_QUERY is true', () => {
    process.env.ENABLE_LLM_QUERY = 'true';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://test.com';
    process.env.LLM_MODEL = 'test-model';

    const config = getLLMConfig();
    expect(config).toEqual({
      enabled: true,
      apiKey: 'test-key',
      baseURL: 'https://test.com',
      model: 'test-model',
      timeout: 10000,
    });
  });

  it('should use defaults for optional fields', () => {
    process.env.ENABLE_LLM_QUERY = 'true';
    process.env.LLM_API_KEY = 'test-key';

    const config = getLLMConfig();
    expect(config?.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    expect(config?.model).toBe('qwen-plus');
    expect(config?.timeout).toBe(10000);
  });
});
