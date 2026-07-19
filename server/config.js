import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function enabledByDefault(value) {
  return !['0', 'false', 'no', 'off'].includes(String(value ?? '').toLowerCase());
}

function list(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export const config = {
  rootDir,
  distDir: path.join(rootDir, 'dist'),
  cacheDir: process.env.CACHE_DIR ? path.resolve(process.env.CACHE_DIR) : path.join(rootDir, '.cache'),
  host: process.env.HOST || '0.0.0.0',
  port: positiveNumber(process.env.PORT, 3000),
  token: process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '',
  apiVersion: process.env.GITHUB_API_VERSION || '2026-03-10',
  cacheTtlMs: positiveNumber(process.env.CACHE_TTL_MINUTES, 360) * 60_000,
  refreshIntervalMs: positiveNumber(process.env.REFRESH_INTERVAL_MINUTES, 360) * 60_000,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  nodeEnv: process.env.NODE_ENV || 'development',
  embedSigningKey: process.env.EMBED_SIGNING_KEY || '',
  embedRateLimitPerMinute: positiveNumber(process.env.EMBED_RATE_LIMIT_PER_MINUTE, 120),
  apiRateLimitPerMinute: positiveNumber(process.env.API_RATE_LIMIT_PER_MINUTE, 240),
  embedHotlinkProtection: enabledByDefault(process.env.EMBED_HOTLINK_PROTECTION),
  embedAllowedHosts: list(process.env.EMBED_ALLOWED_HOSTS ?? 'github.com,*.githubusercontent.com,*.github.io'),
  trustProxy: enabled(process.env.TRUST_PROXY),
  isProduction: process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start',
  includePrivateRepositories: enabled(process.env.INCLUDE_PRIVATE_REPOSITORIES),
};

export function validateConfig(value = config) {
  if (value.embedSigningKey && value.embedSigningKey.length < 32) throw new Error('EMBED_SIGNING_KEY must contain at least 32 characters.');
  if (value.isProduction || value.nodeEnv === 'production') {
    if (!value.token) throw new Error('GITHUB_TOKEN is required in production.');
    if (!value.embedSigningKey) throw new Error('EMBED_SIGNING_KEY is required in production.');
    if (value.publicBaseUrl && !value.publicBaseUrl.startsWith('https://')) throw new Error('PUBLIC_BASE_URL must use HTTPS in production.');
  }
}
