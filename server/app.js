import express from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { GitHubError } from './github.js';
import { renderHistorySvg } from './svg.js';
import { formatServerDateTime, serverTimeZone } from './time.js';
import { createEmbedSigner, createHotlinkGuard, securityHeaders } from './security.js';
import { renderProfileSvg } from './profile-svg.js';

const repoPattern = /^[A-Za-z0-9_.-]+$/;

function validRepoPart(value) {
  return typeof value === 'string' && value.length <= 100 && repoPattern.test(value);
}

function sendSvg(res, svg, headers = {}) {
  const body = Buffer.from(svg, 'utf8');
  return res.status(200).set({
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Content-Length': String(body.byteLength),
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  }).end(body);
}

export function createApp({ config, cache, sync }) {
  const app = express();
  const embedSigner = createEmbedSigner(config.embedSigningKey);
  const apiRateLimit = rateLimit({
    windowMs: 60_000,
    limit: config.apiRateLimitPerMinute || 240,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' }),
  });
  const embedRateLimit = rateLimit({
    windowMs: 60_000,
    limit: config.embedRateLimitPerMinute || 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).type('text').send('Too many image requests'),
  });
  const hotlinkGuard = config.embedHotlinkProtection === false
    ? (_req, _res, next) => next()
    : createHotlinkGuard(config.embedAllowedHosts || []);
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(apiRateLimit);
  app.use(express.json({ limit: '10kb' }));

  async function getHistory(owner, repo) {
    const repositoryIndex = await cache.getRepositories();
    const indexedRepository = (repositoryIndex?.repositories || []).find((repository) => (
      repository.owner.toLowerCase() === owner.toLowerCase()
      && (repository.repo || repository.name).toLowerCase() === repo.toLowerCase()
    ));
    if (!indexedRepository) {
      throw new GitHubError('This repository is not enabled for the configured token.', 404, { code: 'REPOSITORY_NOT_ENABLED' });
    }
    if (indexedRepository.private && !config.includePrivateRepositories) {
      throw new GitHubError('This repository is not publicly available.', 404, { code: 'REPOSITORY_HIDDEN' });
    }
    const cached = await cache.get(owner, repo, { allowStale: true });
    if (!cached) {
      throw new GitHubError('Star history is still being prepared. Check again shortly.', 404, { code: 'HISTORY_PENDING' });
    }
    if (cached.private && !config.includePrivateRepositories) {
      throw new GitHubError('This repository is not publicly available.', 404, { code: 'REPOSITORY_HIDDEN' });
    }
    return { ...cached, source: 'json-cache' };
  }

  app.get('/api/health', async (_req, res) => {
    const entries = await cache.entries();
    res.json({
      ok: true,
      tokenConfigured: Boolean(config.token),
      cachedRepositories: entries.length,
      cacheTtlMinutes: config.cacheTtlMs / 60_000,
      refreshIntervalMinutes: config.refreshIntervalMs / 60_000,
      sync: sync?.snapshot() || null,
    });
  });

  app.get('/api/repositories', async (_req, res, next) => {
    try {
      const cached = await cache.getRepositories();
      const repositories = (cached?.repositories || []).filter((repository) => config.includePrivateRepositories || !repository.private);
      const profile = cached?.profile || null;
      const owner = profile?.login || repositories[0]?.owner || null;
      const baseUrl = config.publicBaseUrl || `${_req.protocol}://${_req.get('host')}`;
      const profileSignature = owner ? embedSigner.sign(owner, 'profile') : '';
      const profileCard = owner ? {
        owner,
        embedUrl: `${baseUrl}/api/profile/${encodeURIComponent(owner)}.svg${profileSignature ? `?sig=${encodeURIComponent(profileSignature)}` : ''}`,
      } : null;
      res.json({ repositories, profile, profileCard, fetchedAt: cached?.fetchedAt || null, sync: sync?.snapshot() || null });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/history/:owner/:repo', async (req, res, next) => {
    try {
      const { owner, repo } = req.params;
      if (!validRepoPart(owner) || !validRepoPart(repo)) return res.status(400).json({ error: 'Invalid repository format. Use owner/repo.', code: 'INVALID_REPO' });
      const history = await getHistory(owner, repo);
      const baseUrl = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
      const embedPath = `/api/embed/${encodeURIComponent(history.owner)}/${encodeURIComponent(history.repo)}.svg`;
      const signature = embedSigner.sign(history.owner, history.repo);
      res.json({
        ...history,
        embedUrl: `${baseUrl}${embedPath}${signature ? `?sig=${encodeURIComponent(signature)}` : ''}`,
        serverTimeZone,
        updatedAtLabel: formatServerDateTime(history.fetchedAt),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/embed/:owner/:repo.svg', embedRateLimit, hotlinkGuard, async (req, res, next) => {
    try {
      const { owner, repo } = req.params;
      if (!validRepoPart(owner) || !validRepoPart(repo)) return res.status(400).type('text').send('Invalid repository');
      if (!embedSigner.verify(owner, repo, req.query.sig)) return res.status(403).type('text').send('Invalid or missing image signature');
      const history = await getHistory(owner, repo);
      const svg = renderHistorySvg(history, req.query);
      sendSvg(res, svg);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/profile/:owner.svg', embedRateLimit, hotlinkGuard, async (req, res, next) => {
    try {
      const { owner } = req.params;
      if (!validRepoPart(owner)) return res.status(400).type('text').send('Invalid GitHub owner');
      if (!embedSigner.verify(owner, 'profile', req.query.sig)) return res.status(403).type('text').send('Invalid or missing image signature');
      const cached = await cache.getRepositories();
      const repositories = (cached?.repositories || []).filter((repository) => (
        repository.owner.toLowerCase() === owner.toLowerCase()
        && (config.includePrivateRepositories || !repository.private)
      ));
      if (!repositories.length) return res.status(404).type('text').send('GitHub profile is not available');
      if (!cached?.profileStats) return res.status(503).type('text').send('GitHub profile stats are still being prepared');
      const svg = renderProfileSvg({
        owner: cached?.profile?.login || repositories[0].owner,
        stats: cached?.profileStats,
        updatedAtLabel: formatServerDateTime(cached?.fetchedAt),
      }, req.query);
      sendSvg(res, svg, { 'Cross-Origin-Resource-Policy': 'cross-origin' });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(config.distDir, { index: false, maxAge: '1h' }));
  app.get('*path', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(config.distDir, 'index.html'), (error) => error && next(error));
  });

  app.use((error, _req, res, _next) => {
    const operational = error instanceof GitHubError;
    const status = operational ? error.status : 500;
    if (status >= 500) console.error(error);
    const message = status >= 500 ? 'The server encountered an unexpected error.' : error.message;
    const details = operational ? error.details : null;
    res.status(status).json({ error: message, code: details?.code || 'INTERNAL_ERROR', ...(details || {}) });
  });
  return { app, getHistory };
}
