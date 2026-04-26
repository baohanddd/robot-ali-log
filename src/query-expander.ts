import { readFileSync } from 'fs';
import { join } from 'path';

interface McpConfig {
  defaultProject?: string;
  defaultLogstore?: string;
  queryAliases?: Record<string, string[]>;
}

let cachedConfig: McpConfig | null = null;

export function clearCache(): void {
  cachedConfig = null;
}

export function loadConfig(): McpConfig {
  if (cachedConfig) return cachedConfig;
  
  try {
    const configPath = join(process.cwd(), 'config', 'mcp.json');
    const content = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(content) as McpConfig;
    return cachedConfig;
  } catch {
    return {};
  }
}

export function getDefaultProject(): string | undefined {
  return loadConfig().defaultProject;
}

export function getDefaultLogstore(): string | undefined {
  return loadConfig().defaultLogstore;
}

export function expandKeywords(input: string): string {
  const config = loadConfig();
  const aliases = config.queryAliases || {};
  const trimmed = input.trim().toLowerCase();

  // Check if input matches any alias key directly
  for (const [key, values] of Object.entries(aliases)) {
    if (key.toLowerCase() === trimmed) {
      return values.join(' OR ');
    }
  }

  // Check if input matches any alias value
  for (const [key, values] of Object.entries(aliases)) {
    if (values.some(v => v.toLowerCase() === trimmed)) {
      return values.join(' OR ');
    }
  }

  // No alias found, return original
  return input;
}
