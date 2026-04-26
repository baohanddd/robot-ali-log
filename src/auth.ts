import { SlsCredentials } from './types';

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
  return process.env.ALICLOUD_REGION || 'cn-hangzhou';
}
