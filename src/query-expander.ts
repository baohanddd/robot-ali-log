import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface LogstoreConfig {
  name: string;
  project: string;
  aliases: string[];
}

interface McpConfig {
  defaultProject?: string;
  defaultLogstore?: string;
  defaultRegion?: string;
  queryAliases?: Record<string, string[]>;
  logstores?: LogstoreConfig[];
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

export function resolveLogstore(input: string): { project: string; logstore: string; matchedAlias: string; matchIndex: number } | null {
  const config = loadConfig();
  const logstores = config.logstores || [];
  const lowerInput = input.toLowerCase();

  // Collect all aliases from all logstores
  const allAliases: { alias: string; logstore: LogstoreConfig }[] = [];
  for (const ls of logstores) {
    for (const alias of ls.aliases) {
      allAliases.push({ alias, logstore: ls });
    }
  }

  // Sort by alias length descending to prefer longer matches
  allAliases.sort((a, b) => b.alias.length - a.alias.length);

  for (const { alias, logstore } of allAliases) {
    const lowerAlias = alias.toLowerCase();
    let idx = lowerInput.indexOf(lowerAlias);

    while (idx !== -1) {
      // Check word boundaries: before and after must not be alphanumeric (English or Chinese)
      const before = idx === 0 || !/[a-zA-Z0-9\u4e00-\u9fa5]/.test(input[idx - 1]);
      const after = idx + alias.length >= input.length || !/[a-zA-Z0-9\u4e00-\u9fa5]/.test(input[idx + alias.length]);

      if (before && after) {
        return { project: logstore.project, logstore: logstore.name, matchedAlias: alias, matchIndex: idx };
      }

      idx = lowerInput.indexOf(lowerAlias, idx + 1);
    }
  }

  return null;
}

export function extractLogstoreFromDescription(desc: string): { project?: string; logstore?: string; cleanedDesc: string } {
  const trimmedDesc = desc.trim();
  const resolved = resolveLogstore(trimmedDesc);

  if (!resolved) {
    return { cleanedDesc: trimmedDesc };
  }

  const idx = resolved.matchIndex;
  const aliasLen = resolved.matchedAlias.length;

  // Excise the matched alias with surrounding whitespace normalization
  const before = trimmedDesc.substring(0, idx).trimEnd();
  const after = trimmedDesc.substring(idx + aliasLen).trimStart();
  const cleanedDesc = (before + ' ' + after).trim().replace(/\s+/g, ' ');

  return {
    project: resolved.project,
    logstore: resolved.logstore,
    cleanedDesc,
  };
}
