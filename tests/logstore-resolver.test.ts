import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs before importing query-expander
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import {
  resolveLogstore,
  extractLogstoreFromDescription,
  clearCache
} from '../src/query-expander.js';
import * as fs from 'fs';

describe('resolveLogstore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should match logstore by alias', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms', 'message']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('sms');
    expect(result).toEqual({ project: 'test-project', logstore: 'sms' });
  });

  it('should prefer longer alias (pro-match over pro)', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'pro',
          project: 'pro-project',
          aliases: ['pro']
        },
        {
          name: 'pro-match',
          project: 'pro-match-project',
          aliases: ['pro-match']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('pro-match');
    expect(result).toEqual({ project: 'pro-match-project', logstore: 'pro-match' });
  });

  it('should return null if no match', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('unknown');
    expect(result).toBeNull();
  });

  it('should be case insensitive', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['SMS', 'Message']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('sms');
    expect(result).toEqual({ project: 'test-project', logstore: 'sms' });
  });
});

describe('extractLogstoreFromDescription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should extract logstore and clean description (remove matched alias)', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = extractLogstoreFromDescription('sms errors today');
    expect(result).toEqual({
      project: 'test-project',
      logstore: 'sms',
      cleanedDesc: 'errors today'
    });
  });

  it('should return original desc if no match', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = extractLogstoreFromDescription('errors today');
    expect(result).toEqual({ cleanedDesc: 'errors today' });
  });
});
