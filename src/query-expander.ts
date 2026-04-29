import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface McpConfig {
  defaultProject?: string;
  defaultLogstore?: string;
  defaultRegion?: string;
}

let cachedConfig: McpConfig | null = null;

export function clearCache(): void {
  cachedConfig = null;
}

export function loadConfig(): McpConfig {
  if (cachedConfig) return cachedConfig;
  
  try {
    // ESM-compatible way to get current file directory
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFilePath);
    const moduleConfigPath = join(currentDir, '..', 'config', 'mcp.json');
    const content = readFileSync(moduleConfigPath, 'utf-8');
    cachedConfig = JSON.parse(content) as McpConfig;
    return cachedConfig;
  } catch {
    try {
      // Fallback to cwd (when running directly)
      const cwdConfigPath = join(process.cwd(), 'config', 'mcp.json');
      const content = readFileSync(cwdConfigPath, 'utf-8');
      cachedConfig = JSON.parse(content) as McpConfig;
      return cachedConfig;
    } catch {
      return {};
    }
  }
}

export function getDefaultProject(): string | undefined {
  return loadConfig().defaultProject;
}

export function getDefaultLogstore(): string | undefined {
  return loadConfig().defaultLogstore;
}

export function getDefaultRegion(): string | undefined {
  return loadConfig().defaultRegion;
}
