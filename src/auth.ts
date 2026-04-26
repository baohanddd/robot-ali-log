import { SlsCredentials } from './types.js';
import { getDefaultRegion } from './query-expander.js';

export function getCredentials(): SlsCredentials {
  const accessKeyId = process.env.ALICLOUD_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALICLOUD_ACCESS_KEY_SECRET;

  if (!accessKeyId) {
    throw new Error('ALICLOUD_ACCESS_KEY_ID environment variable is required');
  }

  if (!accessKeySecret) {
    throw new Error('ALICLOUD_ACCESS_KEY_SECRET environment variable is required');
  }

  return {
    accessKeyId,
    accessKeySecret,
    region: getRegion(),
  };
}

export function getRegion(): string {
  // Priority: environment variable > config file > default
  return process.env.ALICLOUD_REGION || getDefaultRegion() || 'cn-hangzhou';
}
