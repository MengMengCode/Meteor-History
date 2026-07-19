function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

export function list(value) {
  return String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

async function secret(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.get === 'function') return value.get();
  return '';
}

export async function workerConfig(env) {
  const configuredBaseUrl = String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const publicBaseUrl = /^https:\/\/[^/]+$/.test(configuredBaseUrl) ? configuredBaseUrl : '';
  return {
    token: await secret(env.GITHUB_TOKEN),
    embedSigningKey: await secret(env.EMBED_SIGNING_KEY),
    apiVersion: env.GITHUB_API_VERSION || '2026-03-10',
    cacheTtlMs: positiveNumber(env.CACHE_TTL_MINUTES, 360) * 60_000,
    refreshIntervalMs: positiveNumber(env.REFRESH_INTERVAL_MINUTES, 360) * 60_000,
    publicBaseUrl,
    includePrivateRepositories: enabled(env.INCLUDE_PRIVATE_REPOSITORIES),
    embedHotlinkProtection: Boolean(publicBaseUrl) && enabled(env.EMBED_HOTLINK_PROTECTION),
    embedAllowedHosts: list(env.EMBED_ALLOWED_HOSTS || 'github.com,*.githubusercontent.com,*.github.io'),
  };
}
