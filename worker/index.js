import { GitHubError } from '../server/github.js';
import { renderProfileSvg } from '../server/profile-svg.js';
import { KvCache } from './kv-cache.js';
import { workerConfig } from './config.js';
import { renderHistorySvg } from './history-svg.js';
import { createWorkerSigner, hotlinkAllowed, rateLimit } from './security.js';
import { runScheduledSync } from './sync.js';

const repoPattern = /^[A-Za-z0-9_.-]+$/;

function validRepoPart(value) {
  return typeof value === 'string' && value.length <= 100 && repoPattern.test(value);
}

function formatUtc(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).format(date);
}

function commonHeaders(api = true) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Frame-Options': 'DENY',
    ...(api ? { 'Content-Security-Policy': "default-src 'none'" } : {}),
  };
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...commonHeaders(), 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function text(value, status = 200, headers = {}) {
  return new Response(value, { status, headers: { ...commonHeaders(), 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}

async function context(env) {
  const config = await workerConfig(env);
  return {
    config,
    cache: new KvCache(env.METEOR_HISTORY_DATA, config.cacheTtlMs),
    signer: createWorkerSigner(config.embedSigningKey),
  };
}

async function getHistory(cache, config, owner, repo) {
  const repositoryIndex = await cache.getRepositories();
  const indexed = (repositoryIndex?.repositories || []).find((repository) => (
    repository.owner.toLowerCase() === owner.toLowerCase()
    && (repository.repo || repository.name).toLowerCase() === repo.toLowerCase()
  ));
  if (!indexed) throw new GitHubError('This repository is not enabled for the configured token.', 404, { code: 'REPOSITORY_NOT_ENABLED' });
  if (indexed.private && !config.includePrivateRepositories) throw new GitHubError('This repository is not publicly available.', 404, { code: 'REPOSITORY_HIDDEN' });
  const cached = await cache.get(owner, repo, { allowStale: true });
  if (!cached) throw new GitHubError('Star history is still being prepared. Check again shortly.', 404, { code: 'HISTORY_PENDING' });
  return { ...cached, source: 'cloudflare-kv' };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const { config, cache, signer } = await context(env);
  const imageRequest = url.pathname.startsWith('/api/embed/') || url.pathname.startsWith('/api/profile/');
  if (!imageRequest && !await rateLimit(env.API_RATE_LIMITER, request, 'api')) {
    return json({ error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' }, 429, { 'Retry-After': '60' });
  }

  if (url.pathname === '/api/health') {
    const [repositories, sync] = await Promise.all([cache.getRepositories(), cache.getSyncState()]);
    return json({
      ok: true,
      runtime: 'cloudflare-workers',
      tokenConfigured: Boolean(config.token),
      cachedRepositories: repositories?.repositories?.length || 0,
      cacheTtlMinutes: config.cacheTtlMs / 60_000,
      refreshIntervalMinutes: config.refreshIntervalMs / 60_000,
      sync: sync || { running: false, phase: 'waiting-for-scheduled-sync' },
    });
  }

  if (url.pathname === '/api/repositories') {
    const cached = await cache.getRepositories();
    const repositories = (cached?.repositories || []).filter((repository) => config.includePrivateRepositories || !repository.private);
    const profile = cached?.profile || null;
    const owner = profile?.login || repositories[0]?.owner || null;
    const baseUrl = config.publicBaseUrl || url.origin;
    const signature = owner ? await signer.sign(owner, 'profile') : '';
    const profileCard = owner ? {
      owner,
      embedUrl: `${baseUrl}/api/profile/${encodeURIComponent(owner)}.svg${signature ? `?sig=${encodeURIComponent(signature)}` : ''}`,
    } : null;
    return json({ repositories, profile, profileCard, fetchedAt: cached?.fetchedAt || null, sync: await cache.getSyncState() });
  }

  const historyMatch = url.pathname.match(/^\/api\/history\/([^/]+)\/([^/]+)$/);
  if (historyMatch) {
    const owner = decodeURIComponent(historyMatch[1]);
    const repo = decodeURIComponent(historyMatch[2]);
    if (!validRepoPart(owner) || !validRepoPart(repo)) return json({ error: 'Invalid repository format. Use owner/repo.', code: 'INVALID_REPO' }, 400);
    const history = await getHistory(cache, config, owner, repo);
    const baseUrl = config.publicBaseUrl || url.origin;
    const signature = await signer.sign(history.owner, history.repo);
    return json({
      ...history,
      embedUrl: `${baseUrl}/api/embed/${encodeURIComponent(history.owner)}/${encodeURIComponent(history.repo)}.svg${signature ? `?sig=${encodeURIComponent(signature)}` : ''}`,
      serverTimeZone: 'UTC',
      updatedAtLabel: formatUtc(history.fetchedAt),
    });
  }

  const embedMatch = url.pathname.match(/^\/api\/embed\/([^/]+)\/([^/]+)\.svg$/);
  if (embedMatch) {
    if (!await rateLimit(env.EMBED_RATE_LIMITER, request, 'embed')) return text('Too many image requests', 429, { 'Retry-After': '60' });
    const owner = decodeURIComponent(embedMatch[1]);
    const repo = decodeURIComponent(embedMatch[2]);
    if (!validRepoPart(owner) || !validRepoPart(repo)) return text('Invalid repository', 400);
    if (!await signer.verify(owner, repo, url.searchParams.get('sig'))) return text('Invalid or missing image signature', 403);
    if (!hotlinkAllowed(request, config.embedAllowedHosts, config.embedHotlinkProtection)) return text('Image embedding is not allowed from this site', 403);
    const history = await getHistory(cache, config, owner, repo);
    const svg = renderHistorySvg(history, Object.fromEntries(url.searchParams));
    return new Response(svg, { headers: {
      ...commonHeaders(), 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin',
    } });
  }

  const profileMatch = url.pathname.match(/^\/api\/profile\/([^/]+)\.svg$/);
  if (profileMatch) {
    if (!await rateLimit(env.EMBED_RATE_LIMITER, request, 'profile')) return text('Too many image requests', 429, { 'Retry-After': '60' });
    const owner = decodeURIComponent(profileMatch[1]);
    if (!validRepoPart(owner)) return text('Invalid GitHub owner', 400);
    if (!await signer.verify(owner, 'profile', url.searchParams.get('sig'))) return text('Invalid or missing image signature', 403);
    if (!hotlinkAllowed(request, config.embedAllowedHosts, config.embedHotlinkProtection)) return text('Image embedding is not allowed from this site', 403);
    const cached = await cache.getRepositories();
    const repositories = (cached?.repositories || []).filter((repository) => repository.owner.toLowerCase() === owner.toLowerCase() && (config.includePrivateRepositories || !repository.private));
    if (!repositories.length) return text('GitHub profile is not available', 404);
    if (!cached?.profileStats) return text('GitHub profile stats are still being prepared', 503);
    const svg = renderProfileSvg({ owner: cached?.profile?.login || repositories[0].owner, stats: cached.profileStats, updatedAtLabel: formatUtc(cached.fetchedAt) }, Object.fromEntries(url.searchParams));
    return new Response(svg, { headers: {
      ...commonHeaders(), 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin',
    } });
  }

  return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
}

async function fetchHandler(request, env) {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return await handleApi(request, env);
    return env.ASSETS.fetch(request);
  } catch (error) {
    const operational = error instanceof GitHubError;
    const status = operational ? error.status : 500;
    if (status >= 500) console.error(error);
    return json({
      error: status >= 500 ? 'The server encountered an unexpected error.' : error.message,
      code: operational ? error.details?.code || 'GITHUB_ERROR' : 'INTERNAL_ERROR',
      ...(operational ? error.details : {}),
    }, status);
  }
}

export default {
  fetch: fetchHandler,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledSync(env).catch((error) => console.error('Scheduled sync failed:', error)));
  },
};

export { fetchHandler };
